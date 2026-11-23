import type { ModelProfile } from '../core/config.js';
import { AiError } from '../core/errors.js';
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
function observeModelFrame(
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

function tokenCount(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

/** 只接受端点明确报告的累计用量；SDK 补齐的零值不能用于结算。 */
export class ModelWireUsage {
  readonly transport: Transport = {
    received_bytes: 0,
    text_chars: 0,
    terminal_received: false,
    request_timed_out: false,
    input_tokens_reported: false,
    output_tokens_reported: false,
  };
  inputTokens: number | null = null;
  outputTokens: number | null = null;
  private baseInput: number | null = null;
  private cacheCreation: number | null = 0;
  private cacheRead: number | null = 0;
  constructor(private readonly format: ModelProfile['format']) {}
  private report(raw: unknown, initial = false) {
    const usage = object(raw);
    if (!usage) return;
    const openai = this.format === 'openai';
    if (openai) {
      const input = tokenCount(usage.prompt_tokens);
      if (input !== null) this.inputTokens = input;
    } else {
      // Messages 的 delta 只更新出现的累计字段；未报告基础输入不能推断为零。
      if (usage.input_tokens != null) this.baseInput = tokenCount(usage.input_tokens);
      if (usage.cache_creation_input_tokens != null)
        this.cacheCreation = tokenCount(usage.cache_creation_input_tokens);
      if (usage.cache_read_input_tokens != null)
        this.cacheRead = tokenCount(usage.cache_read_input_tokens);
      this.inputTokens =
        this.baseInput !== null && this.cacheCreation !== null && this.cacheRead !== null
          ? tokenCount(this.baseInput + this.cacheCreation + this.cacheRead)
          : null;
    }
    this.transport.input_tokens_reported = this.inputTokens !== null;
    // Messages 起始帧的输出计数只是初始值，最终用量来自 message_delta。
    const output = initial
      ? null
      : tokenCount(openai ? usage.completion_tokens : usage.output_tokens);
    if (output !== null) {
      this.outputTokens = output;
      this.transport.output_tokens_reported = true;
    }
  }
  inspectSseFrame(frame: string, elapsed: number) {
    const data = frame
      .split(/\r?\n/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart())
      .join('\n');
    if (!data || this.transport.terminal_received) return;
    if (this.format === 'openai' && data.trim() === '[DONE]') {
      this.transport.terminal_received = true;
      return;
    }
    const item = object(JSON.parse(data));
    if (!item) return;
    if (item.type === 'error' || item.error)
      throw new AiError('AI_PROVIDER_FAILED', '端点返回错误事件');
    observeModelFrame(this.transport, this.format, item, elapsed);
    if (this.format === 'openai') this.report(item.usage);
    else if (item.type === 'message_start') this.report(object(item.message)?.usage, true);
    else if (item.type === 'message_delta') this.report(item.usage);
    else if (item.type === 'message_stop') this.transport.terminal_received = true;
  }
  observeJson(body: unknown, elapsed: number) {
    const item = object(body);
    if (!item) return;
    if (this.format === 'openai') {
      const choice = object(Array.isArray(item.choices) ? item.choices[0] : undefined);
      if (!choice || !object(choice.message)) return;
      observeModelFrame(
        this.transport,
        this.format,
        { choices: [{ delta: choice.message, finish_reason: choice.finish_reason }] },
        elapsed,
      );
    } else {
      if (item.type !== 'message' || !Array.isArray(item.content)) return;
      for (const block of item.content) {
        observeModelFrame(
          this.transport,
          this.format,
          { type: 'content_block_start', content_block: block },
          elapsed,
        );
      }
      observeModelFrame(
        this.transport,
        this.format,
        { type: 'message_delta', delta: { stop_reason: item.stop_reason } },
        elapsed,
      );
    }
    this.report(item.usage);
    this.transport.terminal_received = true;
  }
}

/** 只转发到当前协议终止帧的空行；终止帧可能跨网络分块，后面的字节不属于模型响应。 */
export class ModelSseFrames {
  private readonly decoder = new TextDecoder();
  private buffer = '';
  private emptyLine = true;

  constructor(
    private readonly wire: ModelWireUsage,
    private readonly maxFrameChars = Infinity,
  ) {}

  private append(bytes: Uint8Array) {
    this.buffer += this.decoder.decode(bytes, { stream: true });
    if (this.buffer.length > this.maxFrameChars)
      throw new AiError('AI_STREAM_INCOMPLETE', '模型事件帧超过限制');
  }

  take(chunk: Uint8Array, elapsed: number) {
    let start = 0;
    for (let index = 0; index < chunk.length; index++) {
      const byte = chunk[index];
      if (byte !== 10) {
        if (byte !== 13) this.emptyLine = false;
        continue;
      }
      if (this.emptyLine) {
        this.append(chunk.subarray(start, index + 1));
        this.wire.inspectSseFrame(this.buffer, elapsed);
        this.buffer = '';
        start = index + 1;
        if (this.wire.transport.terminal_received)
          return start === chunk.length ? chunk : chunk.subarray(0, start);
      }
      this.emptyLine = true;
    }
    if (start < chunk.length) this.append(chunk.subarray(start));
    return chunk;
  }

  /** 部分端点在最后一帧后直接 EOF；只补分帧空行，不能补协议终止标记。 */
  finish(elapsed: number) {
    this.wire.inspectSseFrame(this.buffer + this.decoder.decode(), elapsed);
    if (!this.wire.transport.terminal_received)
      throw new AiError('AI_STREAM_INCOMPLETE', '模型流在终止帧之前结束', true);
    return new Uint8Array([10, 10]);
  }
}
