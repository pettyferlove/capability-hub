import {
  generateText,
  NoObjectGeneratedError,
  Output,
  streamText,
  TypeValidationError,
  type FinishReason,
  type LanguageModelUsage,
} from 'ai';
import { randomUUID } from 'node:crypto';
import type { z } from 'zod';
import type { ModelProfile } from '../core/config.js';
import { AiError, type AiErrorCode } from '../core/errors.js';
import type { CredentialResolver } from '../core/ports.js';
import type { ModelCallDiagnostics } from '../core/records.js';
import type { ModelCallSettlement } from '../execution/model-calls.js';
import {
  createEndpointModel,
  endpointProviderOptions,
  reasoningEffortFor,
} from './endpoint-model.js';
import { ModelSseFrames, ModelWireUsage } from './provider-diagnostics.js';

/** 短调用失败的环节，供宿主区分超时、限流、无效输出等状态。 */
export type ShortModelFailureReason =
  | 'configuration'
  | 'input_too_large'
  | 'timeout'
  | 'rate_limited'
  | 'provider'
  | 'output_too_large'
  | 'invalid_output'
  | 'cancelled';

const failures: Record<ShortModelFailureReason, { code: AiErrorCode; message: string }> = {
  configuration: { code: 'AI_CONFIGURATION', message: '模型配置或凭据不可用' },
  input_too_large: { code: 'AI_BUDGET_EXCEEDED', message: '模型请求内容超过大小上限' },
  timeout: { code: 'AI_PROVIDER_FAILED', message: '模型请求超时' },
  rate_limited: { code: 'AI_PROVIDER_FAILED', message: '模型端点限流' },
  provider: { code: 'AI_PROVIDER_FAILED', message: '模型端点请求失败' },
  output_too_large: { code: 'AI_OUTPUT_INVALID', message: '模型响应超过大小上限' },
  invalid_output: { code: 'AI_OUTPUT_INVALID', message: '模型结构化结果不符合约定' },
  cancelled: { code: 'AI_CANCELLED', message: '模型请求已取消' },
};

const outputFailures = {
  truncated: '模型回答达到本轮输出上限，未取得完整结果',
  filtered: '模型服务未放行本轮回答',
  empty: '模型没有返回回答正文',
  json: '模型回答不是完整的 JSON',
  schema: '模型回答的字段或类型不符合约定',
} as const;

/** 只记录固定失败类别和以 token 为单位的计数，不携带原始响应。 */
interface OutputDiagnostic {
  issue: keyof typeof outputFailures;
  limit: number;
  used: number | null;
  reasoning: number | null;
}

/** 短调用失败。消息固定，不含供应商响应、SDK 原文、模型输出或凭据。 */
export class ShortModelError extends AiError {
  constructor(
    readonly reason: ShortModelFailureReason,
    retryable = reason === 'timeout' || reason === 'rate_limited',
    readonly output?: OutputDiagnostic,
  ) {
    super(
      failures[reason].code,
      output ? outputFailures[output.issue] : failures[reason].message,
      retryable,
    );
    this.name = 'ShortModelError';
  }
}

/** 单次调用的预算；调用方只能收紧模型档案限额及请求、响应的字节上限。 */
export interface ShortModelLimits {
  maxRequestBytes: number;
  maxResponseBytes: number;
  maxOutputTokens: number;
  timeoutMs: number;
}

interface ShortModelReservation {
  executionId: string;
  finish(result: ModelCallSettlement | 'not_sent'): Promise<void>;
}

/** 在实际出站前预留调用；只向执行账本传递配置、传输诊断和端点报告的用量。 */
interface ShortModelObserver {
  start(
    diagnostics: Omit<ModelCallDiagnostics, 'agent_id' | 'step' | 'transport'>,
  ): Promise<ShortModelReservation>;
}

/** 一次结构化短调用的输入：模型档案、凭据、指令、输入、Schema 与预留/释放钩子。 */
export interface ShortModelCall<T extends z.ZodType> {
  profile: ModelProfile;
  credentials: CredentialResolver;
  /** `reasoning_effort_overrides` 的键，如 `catalog-discovery/turn`。 */
  operation: string;
  instructions: string;
  input: string;
  schema: T;
  signal?: AbortSignal;
  limits?: Partial<ShortModelLimits>;
  reserve?: () => void | Promise<void>;
  release?: () => void;
  observer?: ShortModelObserver;
  /**
   * 提供时按流式请求；部分结果未经校验，只用于进度，不应直接展示。
   * 最终输出仍整体按 Schema 校验。
   */
  onPartial?: (partial: unknown) => void;
}

/** 校验后的结构化结果及服务端可记录的用量与耗时。 */
export interface ShortModelResult<T> {
  value: T;
  usage: { input_tokens: number | null; output_tokens: number | null };
  duration_ms: number;
}

/** 未指定更小的限额时，输出和请求时限沿用模型档案。 */
export function shortModelLimits(
  profile: ModelProfile,
  overrides: Partial<ShortModelLimits> = {},
): ShortModelLimits {
  return {
    maxRequestBytes: Math.min(32768, overrides.maxRequestBytes ?? Infinity),
    maxResponseBytes: Math.min(524288, overrides.maxResponseBytes ?? Infinity),
    maxOutputTokens: Math.min(profile.max_output_tokens, overrides.maxOutputTokens ?? Infinity),
    timeoutMs: Math.min(profile.request_timeout_ms, overrides.timeoutMs ?? Infinity),
  };
}

const outputErrors = new Set([
  'AI_NoObjectGeneratedError',
  'AI_NoOutputGeneratedError',
  'AI_JSONParseError',
  'AI_TypeValidationError',
]);

function findError(error: unknown, match: (value: unknown) => boolean): unknown {
  const seen = new Set<unknown>();
  let current = error;
  while (current && typeof current === 'object' && !seen.has(current)) {
    if (match(current)) return current;
    seen.add(current);
    const next: unknown = 'lastError' in current ? current.lastError : (current as Error).cause;
    current = next;
  }
  return undefined;
}

function requestBytes(body: RequestInit['body']): number {
  if (typeof body === 'string') return Buffer.byteLength(body, 'utf8');
  if (body instanceof Uint8Array) return body.byteLength;
  throw new ShortModelError('provider');
}

async function readLimited(
  response: Response,
  limit: number,
  wire: ModelWireUsage,
): Promise<Uint8Array<ArrayBuffer>> {
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    wire.transport.received_bytes += value.byteLength;
    if (wire.transport.received_bytes > limit) {
      await reader.cancel().catch(() => undefined);
      throw new ShortModelError('output_too_large');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(wire.transport.received_bytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

/**
 * 一次性的结构化短调用：最多一次真实网络请求，不重试、不追问模型，不带工具与记忆。
 * 请求体先校验大小再预留配额；`release` 只在预留成功后、传输结束时调用一次，流式时以流结束为准。
 */
export async function callShortModel<T extends z.ZodType>(
  call: ShortModelCall<T>,
): Promise<ShortModelResult<z.infer<T>>> {
  const started = performance.now();
  const { profile } = call;
  const limits = shortModelLimits(profile, call.limits);
  const wire = new ModelWireUsage(profile.format);
  const { transport } = wire;
  const effort = reasoningEffortFor(profile, call.operation);
  const invalid = (issue: OutputDiagnostic['issue'], usage?: LanguageModelUsage) =>
    new ShortModelError('invalid_output', false, {
      issue,
      limit: limits.maxOutputTokens,
      used: wire.outputTokens,
      // 兼容端点未报告推理用量时 SDK 也会填 0，不据此断言模型没有推理。
      reasoning: usage?.outputTokenDetails.reasoningTokens || null,
    });
  const checkFinish = (reason: FinishReason | undefined, usage?: LanguageModelUsage) => {
    if (reason === 'length') throw invalid('truncated', usage);
    if (reason === 'content-filter') throw invalid('filtered', usage);
  };
  let apiKey: string;
  try {
    apiKey = await call.credentials.resolve(profile.credential_ref);
  } catch {
    throw new ShortModelError('configuration');
  }
  if (!apiKey.trim()) throw new ShortModelError('configuration');

  const timeout = AbortSignal.timeout(limits.timeoutMs);
  const lifecycle = new AbortController();
  const signal = AbortSignal.any([
    timeout,
    lifecycle.signal,
    ...(call.signal ? [call.signal] : []),
  ]);
  // 宿主窗口和端点时限都使用 AbortSignal.timeout；普通 abort 不应被归为超时。
  const timedOut = () =>
    signal.reason instanceof DOMException && signal.reason.name === 'TimeoutError';
  let reserveError: unknown;
  let reserved = false;
  let reservation: ShortModelReservation | undefined;
  let fetchStarted = false;
  let complete = false;
  let transportFailure: AiErrorCode = 'AI_PROVIDER_FAILED';
  let streamFailure: ShortModelError | undefined;
  let outbound: Promise<Response> | undefined;
  const send: typeof fetch = async (input, init) => {
    if (requestBytes(init?.body) > limits.maxRequestBytes)
      throw new ShortModelError('input_too_large');
    signal.throwIfAborted();
    try {
      await call.reserve?.();
      reserved = true;
      signal.throwIfAborted();
      reservation = await call.observer?.start({
        model: profile.model,
        format: profile.format,
        request_timeout_ms: limits.timeoutMs,
        max_output_tokens: limits.maxOutputTokens,
        ...(effort && { reasoning_effort: effort }),
      });
    } catch (error) {
      if (!signal.aborted || signal.reason !== error) reserveError = error;
      throw error;
    }
    const sent = performance.now();
    const elapsed = () => Math.round(performance.now() - sent);
    const headers = new Headers(init?.headers);
    for (const [name, value] of Object.entries(profile.request_headers ?? {}))
      headers.set(
        name,
        typeof value === 'string'
          ? value
          : (value.prefix ?? '') + (reservation?.executionId ?? randomUUID()),
      );
    let response: Response;
    try {
      signal.throwIfAborted();
      fetchStarted = true;
      response = await fetch(input, {
        method: init?.method,
        body: init?.body,
        headers,
        redirect: 'error',
        signal,
      });
    } catch (error) {
      if (signal.aborted) throw error;
      throw new ShortModelError('provider');
    }
    transport.headers_ms = elapsed();
    transport.http_status = response.status;
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      if (response.status === 429) throw new ShortModelError('rate_limited');
      throw new ShortModelError('provider', response.status >= 500);
    }
    const replyHeaders = new Headers(response.headers);
    // 正文已解压，保留原编码头会让下游误判。
    replyHeaders.delete('content-encoding');
    replyHeaders.delete('content-length');
    const initResponse = {
      status: response.status,
      statusText: response.statusText,
      headers: replyHeaders,
    };
    if (call.onPartial) {
      transportFailure = 'AI_STREAM_INCOMPLETE';
      if (!response.body || !response.headers.get('content-type')?.includes('text/event-stream')) {
        await response.body?.cancel();
        throw new ShortModelError('provider');
      }
      const frames = new ModelSseFrames(wire);
      const streamError = (error: unknown) => {
        if (error instanceof AiError) transportFailure = error.code;
        streamFailure = new ShortModelError('provider');
        return streamFailure;
      };
      const limited = new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, controller) {
          transport.received_bytes += chunk.byteLength;
          if (transport.received_bytes > limits.maxResponseBytes) {
            transportFailure = 'AI_OUTPUT_INVALID';
            streamFailure = new ShortModelError('output_too_large');
            throw streamFailure;
          }
          try {
            controller.enqueue(frames.take(chunk, elapsed()));
          } catch (error) {
            throw streamError(error);
          }
          if (transport.terminal_received) {
            complete = true;
            controller.terminate();
          }
        },
        flush(controller) {
          try {
            controller.enqueue(frames.finish(elapsed()));
          } catch (error) {
            throw streamError(error);
          }
          complete = true;
        },
      });
      return new Response(response.body.pipeThrough(limited), initResponse);
    }
    const bytes = await readLimited(response, limits.maxResponseBytes, wire);
    try {
      wire.observeJson(JSON.parse(new TextDecoder().decode(bytes)), elapsed());
      complete = transport.terminal_received;
    } catch {
      // SDK 负责将不合法的端点响应映射为调用错误。
    }
    return new Response(bytes, initResponse);
  };
  const guardedFetch: typeof fetch = (input, init) => {
    if (outbound) throw new ShortModelError('provider');
    outbound = send(input, init);
    return outbound;
  };

  try {
    const typed = Output.object({ schema: call.schema });
    let instructions = call.instructions;
    let output = typed;
    if (profile.format === 'openai') {
      // 兼容端点的 json_object 只约束语法；把同一份 Schema 交给模型，最终仍由 SDK 按原 Schema 校验。
      const format = await typed.responseFormat;
      if (format?.type !== 'json' || !format.schema) throw new ShortModelError('configuration');
      instructions += `\n输出 JSON 遵循以下 JSON Schema，只填写本次需要的可选字段：\n${JSON.stringify(format.schema)}`;
      output = {
        ...typed,
        responseFormat: Output.json().responseFormat,
        parseCompleteOutput({ text }, context) {
          // 仅剥掉包住整段 JSON 的代码围栏；不截取散文中的对象，也不补全残缺的 JSON。
          const fence = /^```(?:json)?[ \t]*\r?\n([\s\S]*)\r?\n```$/i.exec(text.trim());
          return typed.parseCompleteOutput({ text: fence?.[1] ?? text }, context);
        },
      };
    }
    const options = {
      model: createEndpointModel(profile, apiKey, guardedFetch),
      instructions,
      prompt: call.input,
      output,
      maxRetries: 0,
      maxOutputTokens: limits.maxOutputTokens,
      abortSignal: signal,
      providerOptions: endpointProviderOptions(profile, effort),
    };
    let value: z.infer<T>;
    let usage: LanguageModelUsage;
    if (call.onPartial) {
      // 流式错误经回调送达而不是抛出，取第一处失败按同一规则归类。
      let failure: Error | undefined;
      const result = streamText({
        ...options,
        onError: ({ error }) => {
          failure ??= error instanceof Error ? error : new ShortModelError('provider');
        },
      });
      for await (const partial of result.partialOutputStream) call.onPartial(partial);
      if (failure !== undefined) throw failure;
      usage = await result.usage;
      checkFinish(await result.finishReason, usage);
      value = (await result.output) as z.infer<T>;
    } else {
      const result = await generateText(options);
      usage = result.usage;
      checkFinish(result.finishReason, usage);
      value = result.output as z.infer<T>;
    }
    if (!complete) throw new ShortModelError('provider');
    return {
      value,
      usage: {
        input_tokens: wire.inputTokens,
        output_tokens: wire.outputTokens,
      },
      duration_ms: Math.round(performance.now() - started),
    };
  } catch (error) {
    if (reserveError !== undefined && findError(error, (value) => value === reserveError))
      throw reserveError instanceof Error ? reserveError : new ShortModelError('provider');
    if (timedOut()) throw new ShortModelError('timeout');
    if (call.signal?.aborted) throw new ShortModelError('cancelled');
    if (streamFailure) throw streamFailure;
    const known = findError(error, (value) => value instanceof ShortModelError);
    if (known instanceof ShortModelError) {
      if (known.reason === 'output_too_large') transportFailure = known.code;
      throw known;
    }
    const objectError = findError(error, (value) => NoObjectGeneratedError.isInstance(value));
    if (NoObjectGeneratedError.isInstance(objectError)) {
      checkFinish(objectError.finishReason, objectError.usage);
      const issue = !objectError.text?.trim()
        ? 'empty'
        : TypeValidationError.isInstance(objectError.cause)
          ? 'schema'
          : 'json';
      throw invalid(issue, objectError.usage);
    }
    if (findError(error, (value) => outputErrors.has((value as Error).name)))
      throw new ShortModelError('invalid_output');
    throw new ShortModelError('provider');
  } finally {
    // SDK 可能先于预留回调或响应体结束；不让悬空的请求越过本次执行的结算边界。
    lifecycle.abort();
    try {
      await outbound?.catch(() => undefined);
      transport.request_timed_out = !complete && timedOut();
      await reservation?.finish(
        fetchStarted
          ? {
              transport,
              inputTokens: wire.inputTokens,
              outputTokens: wire.outputTokens,
              complete,
              errorCode: complete
                ? null
                : transport.request_timed_out
                  ? 'AI_PROVIDER_FAILED'
                  : call.signal?.aborted
                    ? 'AI_CANCELLED'
                    : transportFailure,
            }
          : 'not_sent',
      );
    } finally {
      if (reserved) call.release?.();
    }
  }
}
