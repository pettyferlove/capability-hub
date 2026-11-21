import {
  createEndpointModel,
  endpointProviderOptions,
  reasoningEffortFor,
  type EndpointModel,
} from './endpoint-model.js';
import type { AgentExecutionOptions } from '@mastra/core/agent';
import type { AiAuthorization, CredentialResolver } from '../core/ports.js';
import type { AiConfiguration, ModelProfile } from '../core/config.js';
import type { ModelCallDiagnostics } from '../core/records.js';
import { AiError } from '../core/errors.js';
import { type ExecutionScope } from '../execution/scope.js';
import { type AiEventService } from '../execution/events.js';
import { reserveModelCall, settleModelCall, withdrawModelCall } from '../execution/model-calls.js';
import { ModelWireUsage, observeModelHttpError } from './provider-diagnostics.js';

/**
 * 单次执行内的模型客户端：调用前在事务里预留 `ai_calls` 并扣减请求预算，用量在请求结束后
 * 结算；首个传输失败会记住并中止本轮作用域，重试只由宿主队列决定，不交给 SDK 自行重试。
 */
export class ManagedProvider {
  private failure: AiError | undefined;
  private readonly reasoningEffort: ModelCallDiagnostics['reasoning_effort'];
  constructor(
    private readonly scope: ExecutionScope,
    private readonly events: AiEventService,
    private readonly authorization: AiAuthorization,
    private readonly credentials: CredentialResolver,
    private readonly config: AiConfiguration,
    readonly profile: ModelProfile,
    private readonly agentId: string,
    operationId: string,
  ) {
    this.reasoningEffort = reasoningEffortFor(profile, `${operationId}/${agentId}`);
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
      request_timeout_ms: this.profile.request_timeout_ms,
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
    const wire = new ModelWireUsage(this.profile.format);
    const { transport } = wire;
    const started = performance.now();
    const elapsed = () => Math.round(performance.now() - started);
    const timeout = AbortSignal.timeout(this.profile.request_timeout_ms);
    const signal = AbortSignal.any([
      controller.signal,
      timeout,
      ...(init?.signal ? [init.signal] : []),
    ]);
    const settle = async (error?: AiError) => {
      try {
        await this.scope.write((execution) =>
          settleModelCall(this.events, execution, callId, {
            transport,
            inputTokens: wire.inputTokens,
            outputTokens: wire.outputTokens,
            complete: !error && transport.terminal_received,
            errorCode: error?.code ?? null,
          }),
        );
      } catch (cause) {
        if (!controller.signal.aborted) throw cause;
        // 已失去租约时由新执行者将 pending 请求收敛为 unknown，旧执行者不能补写。
      }
    };
    const connectionFailure = (message: string) => {
      transport.request_timed_out = timeout.aborted && signal.reason === timeout.reason;
      return new AiError(
        'AI_PROVIDER_FAILED',
        transport.request_timed_out ? '模型请求超时' : message,
        true,
      );
    };
    let fetchStarted = false;
    try {
      let headers = init?.headers;
      if (this.profile.request_headers) {
        const merged = new Headers(
          headers ?? (input instanceof Request ? input.headers : undefined),
        );
        for (const [name, value] of Object.entries(this.profile.request_headers))
          merged.set(
            name,
            typeof value === 'string' ? value : (value.prefix ?? '') + lease.execution_id,
          );
        headers = merged;
      }
      signal.throwIfAborted();
      fetchStarted = true;
      const response = await fetch(input, { ...init, headers, redirect: 'error', signal });
      transport.headers_ms = elapsed();
      transport.http_status = response.status;
      if (!response.ok) {
        await observeModelHttpError(transport, response);
        throw new AiError(
          'AI_PROVIDER_FAILED',
          `模型端点返回 HTTP ${response.status}`,
          response.status === 429 || response.status >= 500,
        );
      }
      if (!response.body || !response.headers.get('content-type')?.includes('text/event-stream')) {
        await response.body?.cancel();
        throw new AiError('AI_STREAM_INCOMPLETE', '模型端点未返回 SSE');
      }
      const decoder = new TextDecoder();
      let buffer = '';
      const reader = response.body.getReader();
      const body = new ReadableStream<Uint8Array>({
        pull: async (sink) => {
          try {
            const chunk = await reader.read();
            if (chunk.done) {
              buffer += decoder.decode();
              if (buffer.trim()) wire.inspectSseFrame(buffer, elapsed());
              if (!transport.terminal_received)
                throw new AiError('AI_STREAM_INCOMPLETE', '模型流在终止帧之前结束', true);
              await settle();
              sink.close();
              reader.releaseLock();
              return;
            }
            transport.received_bytes += chunk.value.byteLength;
            buffer += decoder.decode(chunk.value, { stream: true });
            if (buffer.length > 262144)
              throw new AiError('AI_STREAM_INCOMPLETE', '模型事件帧超过限制');
            const frames = buffer.split(/\r?\n\r?\n/);
            buffer = frames.pop() ?? '';
            for (const frame of frames) wire.inspectSseFrame(frame, elapsed());
            sink.enqueue(chunk.value);
          } catch (error) {
            const failure = error instanceof AiError ? error : connectionFailure('模型连接中断');
            await settle(failure);
            this.failure ??= failure;
            controller.abort(failure);
            await reader.cancel().catch(() => undefined);
            sink.error(failure);
          }
        },
        cancel: async () => {
          await reader.cancel();
          await settle(new AiError('AI_INTERRUPTED', '模型流已中断'));
        },
      });
      return new Response(body, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    } catch (error) {
      const failure = error instanceof AiError ? error : connectionFailure('模型端点连接失败');
      if (fetchStarted) await settle(failure);
      else {
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
