import type { ModelProfile } from '../core/config.js';
import { upstreamIdentifierSchema, type ModelCallDiagnostics } from '../core/records.js';

type Transport = NonNullable<ModelCallDiagnostics['transport']>;
const maxErrorBodyBytes = 8192;
const errorBodyTimeoutMs = 500;
const upstreamRequestIdHeaders = [
  'x-request-id',
  'request-id',
  'apim-request-id',
  'x-ms-request-id',
  'x-amzn-requestid',
  'x-amz-request-id',
  'x-dashscope-request-id',
];

const finishReasons = new Map<string, NonNullable<Transport['finish_reason']>>([
  ['stop', 'stop'],
  ['end_turn', 'stop'],
  ['stop_sequence', 'stop'],
  ['length', 'length'],
  ['max_tokens', 'length'],
  ['model_context_window_exceeded', 'context_limit'],
  ['tool_calls', 'tool_call'],
  ['function_call', 'tool_call'],
  ['tool_use', 'tool_call'],
  ['content_filter', 'content_filter'],
  ['refusal', 'content_filter'],
]);

function object(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function identifier(value: unknown) {
  if (typeof value !== 'string') return undefined;
  const parsed = upstreamIdentifierSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

async function readErrorEnvelope(response: Response) {
  const stream = response.body;
  if (!stream) return;
  const type = response.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase();
  if (
    (type !== 'application/json' && !type?.endsWith('+json')) ||
    Number(response.headers.get('content-length')) > maxErrorBodyBytes
  ) {
    void stream.cancel().catch(() => undefined);
    return;
  }
  const reader = stream.getReader();
  let expired = false;
  const timeout = setTimeout(() => {
    expired = true;
    void reader.cancel().catch(() => undefined);
  }, errorBodyTimeoutMs);
  timeout.unref();
  try {
    const decoder = new TextDecoder('utf-8', { fatal: true });
    let bytes = 0;
    let text = '';
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) return expired ? undefined : object(JSON.parse(text + decoder.decode()));
      bytes += chunk.value.byteLength;
      if (bytes > maxErrorBodyBytes) return;
      text += decoder.decode(chunk.value, { stream: true });
    }
  } catch {
    return undefined;
  } finally {
    clearTimeout(timeout);
    void reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

/** 错误体只用于提取协议标识；读取或解析失败不得遮蔽已收到的 HTTP 状态。 */
export async function observeModelHttpError(transport: Transport, response: Response) {
  for (const name of upstreamRequestIdHeaders) {
    const id = identifier(response.headers.get(name));
    if (id) {
      transport.upstream_request_id = id;
      break;
    }
  }
  const envelope = await readErrorEnvelope(response);
  if (!envelope) return;
  const error = object(envelope.error);
  for (const value of [error?.code, envelope.code, error?.type]) {
    const code = identifier(
      typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : value,
    );
    if (code) {
      transport.upstream_error_code = code;
      break;
    }
  }
  if (!transport.upstream_request_id) {
    const id = identifier(envelope.request_id);
    if (id) transport.upstream_request_id = id;
  }
}

function hasText(value: unknown) {
  return typeof value === 'string' && value.length > 0;
}

/** 心跳、角色与用量帧不代表模型已开始输出。推理与工具增量只计时间，正文只计字符数。 */
export function observeModelFrame(
  transport: Transport,
  format: ModelProfile['format'],
  frame: Record<string, unknown>,
  elapsed: number,
) {
  let text: unknown;
  let stop: unknown;
  let otherOutput = false;
  if (format === 'openai') {
    const choice = object(Array.isArray(frame.choices) ? frame.choices[0] : undefined);
    const delta = object(choice?.delta);
    text = delta?.content;
    stop = choice?.finish_reason;
    otherOutput =
      hasText(delta?.reasoning_content) ||
      hasText(delta?.reasoning) ||
      (Array.isArray(delta?.tool_calls) && delta.tool_calls.length > 0) ||
      !!object(delta?.function_call);
  } else if (frame.type === 'content_block_delta') {
    const delta = object(frame.delta);
    text = delta?.text;
    otherOutput = hasText(delta?.thinking) || hasText(delta?.partial_json);
  } else if (frame.type === 'content_block_start') {
    const block = object(frame.content_block);
    text = block?.text;
    otherOutput = block?.type === 'tool_use' || hasText(block?.thinking);
  } else if (frame.type === 'message_delta') {
    stop = object(frame.delta)?.stop_reason;
  }
  if (typeof text === 'string') transport.text_chars += text.length;
  if (otherOutput || hasText(text)) {
    transport.first_output_ms ??= elapsed;
    transport.last_output_ms = elapsed;
  }
  if (typeof stop === 'string' && stop)
    transport.finish_reason = finishReasons.get(stop) ?? 'other';
}
