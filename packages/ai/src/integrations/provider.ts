import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { createAnthropic } from '@ai-sdk/anthropic';
import { randomUUID } from 'node:crypto';
import type { AiAuthorization, CredentialResolver } from '../core/ports.js';
import type { AiConfiguration, ModelProfile } from '../core/config.js';
import type { AiRecordMap, ModelCallDiagnostics } from '../core/records.js';
import { AiError } from '../core/errors.js';
import { type ExecutionScope } from '../execution/scope.js';
import { type AiEventService } from '../execution/events.js';
import { observeModelFrame } from './provider-diagnostics.js';

type EndpointModel = ReturnType<ReturnType<typeof createOpenAICompatible>>;

/**
 * 单次执行内的模型客户端：调用前在事务里预留 `ai_calls` 并扣减请求预算，用量在请求结束后
 * 结算；首个传输失败会记住并中止本轮作用域，重试只由宿主队列决定，不交给 SDK 自行重试。
 */
export class ManagedProvider {
  private failure: AiError | undefined;
  constructor(
    private readonly scope: ExecutionScope,
    private readonly events: AiEventService,
    private readonly authorization: AiAuthorization,
    private readonly credentials: CredentialResolver,
    private readonly config: AiConfiguration,
    readonly profile: ModelProfile,
    private readonly agentId: string,
  ) {}
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
    const options = {
      baseURL: this.profile.base_url.replace(/\/$/, ''),
      apiKey,
      fetch: this.fetch,
    };
    return this.profile.format === 'openai'
      ? createOpenAICompatible({ ...options, name: 'hub-openai', includeUsage: true })(
          this.profile.model,
        )
      : createAnthropic(options)(this.profile.model);
  }
  private async reserve(diagnostics: ModelCallDiagnostics): Promise<AiRecordMap['ai_calls']> {
    const owner = this.scope.current().owner_id;
    return this.scope.write(async (execution) => {
      await this.authorization.authorize(owner, 'execute', execution);
      if (execution.payload.usage.requests >= this.config.max_requests)
        throw new AiError('AI_BUDGET_EXCEEDED', '模型请求次数已达到上限');
      const now = new Date().toISOString();
      const call: AiRecordMap['ai_calls'] = {
        id: randomUUID(),
        owner_id: owner,
        execution_id: execution.id,
        lookup_key: execution.id,
        status: 'pending',
        position: execution.payload.usage.requests + 1,
        created_at: now,
        updated_at: now,
        payload: {
          attempt: execution.payload.attempt,
          profile: this.profile.id,
          diagnostics,
          input_tokens: 0,
          output_tokens: 0,
          error_code: null,
          duration_ms: 0,
        },
      };
      execution.payload.usage.requests++;
      await this.scope.store.put('ai_executions', execution);
      await this.scope.store.insert('ai_calls', call);
      return call;
    });
  }
  private async settle(
    call: AiRecordMap['ai_calls'],
    usage: { input: number; output: number; known: boolean },
    error?: AiError,
  ) {
    await this.scope.write(async (execution) => {
      const prior = await this.scope.store.get('ai_calls', call.id);
      if (!prior || prior.status !== 'pending') return;
      call.status = error ? 'failed' : usage.known ? 'succeeded' : 'unknown';
      call.updated_at = new Date().toISOString();
      call.payload = {
        ...call.payload,
        input_tokens: usage.input,
        output_tokens: usage.output,
        duration_ms: Date.now() - Date.parse(call.created_at),
        error_code: error?.code ?? null,
      };
      execution.payload.usage.input_tokens += usage.input;
      execution.payload.usage.output_tokens += usage.output;
      if (!usage.known) execution.payload.usage.unknown_requests++;
      await this.scope.store.put('ai_calls', call);
      await this.events.append(execution, 'usage.updated', { ...execution.payload.usage });
    });
  }
  // Mastra 会在部分错误下自行重试。首个传输失败中止本轮作用域，重试只由宿主队列决定。
  private readonly fetch: typeof fetch = async (input, init) => {
    const { controller, step } = this.scope.current();
    controller.signal.throwIfAborted();
    const diagnostics: ModelCallDiagnostics = {
      agent_id: this.agentId,
      ...(step && { step }),
      model: this.profile.model,
      format: this.profile.format,
      request_timeout_ms: this.profile.request_timeout_ms,
      max_output_tokens: this.profile.max_output_tokens,
    };
    let call: AiRecordMap['ai_calls'];
    try {
      call = await this.reserve(diagnostics);
    } catch (error) {
      return this.fail(
        error instanceof AiError ? error : new AiError('AI_INTERNAL', '模型请求预留失败'),
      );
    }
    const usage = { input: 0, output: 0, known: false };
    const transport: NonNullable<ModelCallDiagnostics['transport']> = {
      received_bytes: 0,
      text_chars: 0,
      terminal_received: false,
      request_timed_out: false,
      input_tokens_reported: false,
      output_tokens_reported: false,
    };
    const started = performance.now();
    const elapsed = () => Math.round(performance.now() - started);
    const timeout = AbortSignal.timeout(this.profile.request_timeout_ms);
    const signal = AbortSignal.any([
      controller.signal,
      timeout,
      ...(init?.signal ? [init.signal] : []),
    ]);
    const settle = async (error?: AiError) => {
      call.payload.diagnostics = { ...diagnostics, transport };
      try {
        await this.settle(call, { ...usage, known: usage.known && !error }, error);
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
    try {
      const response = await fetch(input, { ...init, redirect: 'error', signal });
      transport.headers_ms = elapsed();
      transport.http_status = response.status;
      if (!response.ok) {
        await response.body?.cancel();
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
      const inspect = (frame: string) => {
        const data = frame
          .split(/\r?\n/)
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).trimStart())
          .join('\n');
        if (this.profile.format === 'openai' && data.trim() === '[DONE]') {
          transport.terminal_received = true;
          return;
        }
        if (!data) return;
        const parsed: unknown = JSON.parse(data);
        if (!parsed || typeof parsed !== 'object') return;
        const item = parsed as Record<string, unknown>;
        observeModelFrame(transport, this.profile.format, item, elapsed());
        if (this.profile.format === 'anthropic' && item.type === 'message_stop')
          transport.terminal_received = true;
        const message =
          item.message && typeof item.message === 'object'
            ? (item.message as Record<string, unknown>)
            : undefined;
        const openai = this.profile.format === 'openai';
        const raw = openai
          ? item.usage
          : item.type === 'message_start'
            ? message?.usage
            : item.type === 'message_delta'
              ? item.usage
              : undefined;
        if (!raw || typeof raw !== 'object') return;
        const record = raw as Record<string, unknown>;
        const inputTokens = openai ? record.prompt_tokens : record.input_tokens;
        // Messages 起始帧的 output_tokens 只是初始值，完整输出用量来自 message_delta。
        const outputTokens = openai
          ? record.completion_tokens
          : item.type === 'message_delta'
            ? record.output_tokens
            : undefined;
        if (
          typeof inputTokens === 'number' &&
          Number.isSafeInteger(inputTokens) &&
          inputTokens >= 0
        ) {
          usage.input = inputTokens;
          transport.input_tokens_reported = true;
        }
        if (
          typeof outputTokens === 'number' &&
          Number.isSafeInteger(outputTokens) &&
          outputTokens >= 0
        ) {
          usage.output = outputTokens;
          transport.output_tokens_reported = true;
        }
        usage.known = transport.input_tokens_reported && transport.output_tokens_reported;
      };
      const body = new ReadableStream<Uint8Array>({
        pull: async (sink) => {
          try {
            const chunk = await reader.read();
            if (chunk.done) {
              buffer += decoder.decode();
              if (buffer.trim()) inspect(buffer);
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
            for (const frame of frames) inspect(frame);
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
      await settle(failure);
      return this.fail(failure);
    }
  };
}
