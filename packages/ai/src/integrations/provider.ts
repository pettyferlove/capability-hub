import {
  createEndpointModel,
  endpointProviderOptions,
  reasoningEffortFor,
  requestTimeoutFor,
  type EndpointModel,
} from './endpoint-model.js';
import type { AgentExecutionOptions } from '@mastra/core/agent';
import type { AiAuthorization, AiExchangeRetention, CredentialResolver } from '../core/ports.js';
import type { AiConfiguration, ModelProfile } from '../core/config.js';
import type { ModelCallDiagnostics } from '../core/records.js';
import { AiError } from '../core/errors.js';
import { type ExecutionScope } from '../execution/scope.js';
import { type AiEventService } from '../execution/events.js';
import { reserveModelCall, settleModelCall, withdrawModelCall } from '../execution/model-calls.js';
import { ModelExchangeCapture } from './model-exchange.js';
import { WirePrivacy } from './wire-content.js';
import {
  ModelSseFrames,
  ModelWireUsage,
  networkErrorCode,
  observeModelHttpError,
} from './provider-diagnostics.js';

/**
 * 单次执行内的模型客户端：调用前在事务里预留 `ai_calls` 并扣减请求预算，用量在请求结束后
 * 结算；首个传输失败会记住并中止本轮作用域，重试只由宿主队列决定，不交给 SDK 自行重试。
 */
export class ManagedProvider {
  /** 最近一次已预留的调用，结构化读取据此记录输出结论。 */
  lastCallId: string | undefined;
  private failure: AiError | undefined;
  private readonly reasoningEffort: ModelCallDiagnostics['reasoning_effort'];
  private readonly requestTimeoutMs: number;
  constructor(
    private readonly scope: ExecutionScope,
    private readonly events: AiEventService,
    private readonly authorization: AiAuthorization,
    private readonly credentials: CredentialResolver,
    private readonly config: AiConfiguration,
    readonly profile: ModelProfile,
    private readonly agentId: string,
    operationId: string,
    private readonly exchanges?: AiExchangeRetention,
  ) {
    const key = `${operationId}/${agentId}`;
    this.reasoningEffort = reasoningEffortFor(profile, key);
    this.requestTimeoutMs = requestTimeoutFor(profile, key);
  }
  get providerOptions(): AgentExecutionOptions['providerOptions'] {
    return endpointProviderOptions(this.profile, this.reasoningEffort);
  }
  assertSuccess() {
    if (this.failure) throw this.failure;
    this.scope.current().controller.signal.throwIfAborted();
  }
  private fail(error: AiError): never {
    this.failure ??= error;
    this.scope.current().controller.abort(this.failure);
    throw this.failure;
  }
  async model(): Promise<EndpointModel> {
    const apiKey = await this.credentials.resolve(this.profile.credential_ref);
    if (!apiKey.trim()) throw new AiError('AI_CONFIGURATION', '模型凭据不可用');
    return createEndpointModel(this.profile, apiKey, this.fetch);
  }
  // Mastra 会在部分错误下自行重试。首个传输失败中止本轮作用域，重试只由宿主队列决定。
  private readonly fetch: typeof fetch = async (input, init) => {
    const { controller, lease, step } = this.scope.current();
    controller.signal.throwIfAborted();
    const diagnostics: ModelCallDiagnostics = {
      agent_id: this.agentId,
      ...(step && { step }),
      model: this.profile.model,
      format: this.profile.format,
      request_timeout_ms: this.requestTimeoutMs,
      max_output_tokens: this.profile.max_output_tokens,
      ...(this.reasoningEffort && { reasoning_effort: this.reasoningEffort }),
    };
    let callId: string;
    try {
      callId = await this.scope.write(async (execution) => {
        await this.authorization.authorize(execution.owner_id, 'execute', execution);
        const id = await reserveModelCall(
          this.scope.store,
          execution,
          diagnostics,
          this.config.max_requests,
        );
        controller.signal.throwIfAborted();
        return id;
      });
    } catch (error) {
      return this.fail(
        error instanceof AiError ? error : new AiError('AI_INTERNAL', '模型请求预留失败'),
      );
    }
    this.lastCallId = callId;
    const exchanges = this.exchanges;
    const subject = exchanges
      ? await this.scope.store
          .tx(async () => exchanges.subject(await this.scope.read()))
          .catch(() => null)
      : null;
    const capture = subject !== null ? new ModelExchangeCapture(this.profile.format) : undefined;
    const privacy = new WirePrivacy();
    const wire = new ModelWireUsage(this.profile.format, capture, privacy);
    const { transport } = wire;
    if (typeof init?.body === 'string') transport.request_bytes = Buffer.byteLength(init.body);
    const started = performance.now();
    const elapsed = () => Math.round(performance.now() - started);
    const timeout = AbortSignal.timeout(this.requestTimeoutMs);
    const signal = AbortSignal.any([
      controller.signal,
      timeout,
      ...(init?.signal ? [init.signal] : []),
    ]);
    const settle = async (error?: AiError) => {
      if (
        !controller.signal.aborted &&
        (error?.code === 'AI_PROVIDER_FAILED' || error?.code === 'AI_STREAM_INCOMPLETE')
      )
        error.callId = callId;
      try {
        await this.scope.write(async (execution) =>
          settleModelCall(
            this.events,
            execution,
            callId,
            {
              transport,
              inputTokens: wire.inputTokens,
              outputTokens: wire.outputTokens,
              complete: !error && transport.terminal_received,
              errorCode: error?.code ?? null,
            },
            capture && subject !== null ? { subject, payload: capture.payload([]) } : undefined,
          ),
        );
      } catch (cause) {
        if (!controller.signal.aborted) throw cause;
        // 已失去租约时由新执行者将 pending 请求收敛为 unknown，旧执行者不能补写。
      }
    };
    const connectionFailure = (message: string, cause?: unknown, inStream = false) => {
      transport.request_timed_out = timeout.aborted && signal.reason === timeout.reason;
      if (signal.aborted && !transport.request_timed_out) {
        const reason: unknown = signal.reason;
        if (
          reason instanceof AiError &&
          ['AI_DEADLINE_EXCEEDED', 'AI_CANCELLED', 'AI_INTERRUPTED', 'AI_LEASE_LOST'].includes(
            reason.code,
          )
        )
          return reason;
        return reason instanceof Error && reason.name === 'TimeoutError'
          ? new AiError('AI_DEADLINE_EXCEEDED', '执行已超过时限')
          : new AiError('AI_CANCELLED', '模型请求已取消');
      }
      const code = networkErrorCode(cause, privacy);
      if (code && !transport.request_timed_out) transport.network_error = code;
      return new AiError(
        inStream && !transport.request_timed_out ? 'AI_STREAM_INCOMPLETE' : 'AI_PROVIDER_FAILED',
        transport.request_timed_out ? '模型请求超时' : message,
        true,
      );
    };
    let fetchStarted = false;
    try {
      const headers = new Headers(
        init?.headers ?? (input instanceof Request ? input.headers : undefined),
      );
      for (const [name, value] of Object.entries(this.profile.request_headers ?? {}))
        headers.set(
          name,
          typeof value === 'string' ? value : (value.prefix ?? '') + lease.execution_id,
        );
      privacy.configure(headers);
      capture?.sent(init?.body, privacy);
      signal.throwIfAborted();
      fetchStarted = true;
      const response = await fetch(input, { ...init, headers, redirect: 'error', signal });
      transport.headers_ms = elapsed();
      transport.http_status = response.status;
      capture?.responded();
      if (!response.ok) {
        await observeModelHttpError(transport, response, privacy, capture);
        throw new AiError(
          'AI_PROVIDER_FAILED',
          `模型端点返回 HTTP ${response.status}`,
          response.status === 429 || response.status >= 500,
        );
      }
      if (!response.body || !response.headers.get('content-type')?.includes('text/event-stream')) {
        await observeModelHttpError(transport, response, privacy, capture);
        throw new AiError('AI_PROVIDER_FAILED', '模型端点未返回 SSE');
      }
      const frames = new ModelSseFrames(wire, 262144, capture);
      const reader = response.body.getReader();
      let released = false;
      const release = () => {
        if (released) return;
        released = true;
        void reader.cancel().catch(() => undefined);
        reader.releaseLock();
      };
      let cancelled = false;
      let settlement: Promise<void> | undefined;
      const finish = (error?: AiError) => (settlement ??= settle(error));
      const body = new ReadableStream<Uint8Array>({
        pull: async (sink) => {
          try {
            const chunk = await reader.read();
            if (cancelled) return;
            if (!chunk.done) transport.received_bytes += chunk.value.byteLength;
            const bytes = chunk.done
              ? frames.finish(elapsed())
              : frames.take(chunk.value, elapsed());
            if (transport.terminal_received) {
              release();
              await finish();
              if (cancelled) return;
              sink.enqueue(bytes);
              sink.close();
            } else sink.enqueue(bytes);
          } catch (error) {
            if (cancelled) return;
            release();
            if (settlement) {
              const failure =
                error instanceof AiError ? error : new AiError('AI_INTERNAL', '模型调用结算失败');
              this.failure ??= failure;
              controller.abort(failure);
              sink.error(failure);
              return;
            }
            const failure =
              error instanceof AiError
                ? error
                : error instanceof SyntaxError
                  ? new AiError('AI_PROVIDER_FAILED', '模型端点返回无效事件')
                  : connectionFailure('模型连接中断', error, true);
            if (
              !(error instanceof AiError) &&
              (failure.code === 'AI_STREAM_INCOMPLETE' || signal.aborted)
            )
              frames.incomplete();
            await finish(failure);
            this.failure ??= failure;
            controller.abort(failure);
            sink.error(failure);
          }
        },
        cancel: async () => {
          cancelled = true;
          release();
          if (!transport.terminal_received) frames.incomplete();
          await finish(
            transport.terminal_received
              ? undefined
              : signal.aborted
                ? connectionFailure('模型请求已取消')
                : new AiError('AI_INTERRUPTED', '模型流已中断'),
          );
        },
      });
      return new Response(body, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    } catch (error) {
      const failure =
        error instanceof AiError ? error : connectionFailure('模型端点连接失败', error);
      if (fetchStarted) {
        await settle(failure);
      } else {
        // 中断会阻止正常步骤写入；仅持有原租约时可以撤回尚未出站的预留。
        await this.scope.store.tx(async () => {
          await this.scope.queue.assert(lease);
          const execution = await this.scope.read();
          if (execution.status === 'running' && execution.payload.dispatch_id === lease.dispatch_id)
            await withdrawModelCall(this.scope.store, execution, callId);
        });
      }
      return this.fail(failure);
    }
  };
}
