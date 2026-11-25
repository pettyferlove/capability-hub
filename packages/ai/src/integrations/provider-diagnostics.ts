import type { ModelProfile } from '../core/config.js';
import { AiError } from '../core/errors.js';
import { upstreamIdentifierSchema, type ModelCallDiagnostics } from '../core/records.js';
import type { ModelExchangeCapture } from './model-exchange.js';
import { openAiContent, WirePrivacy, wireObject as object } from './wire-content.js';

type Transport = NonNullable<ModelCallDiagnostics['transport']>;
const maxErrorBodyBytes = 8192;
const errorBodyTimeoutMs = 500;
const unavailable = Promise.resolve(null);
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

function identifier(value: unknown, privacy?: WirePrivacy) {
  if (typeof value !== 'string' || (privacy && privacy.text(value) !== value)) return undefined;
  const parsed = upstreamIdentifierSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

/** 只采集有界的 UTF-8 前缀，超限或读取失败时不补齐尾部字符。 */
async function readErrorBody(response: Response, transport: Transport, waitForBody: boolean) {
  const stream = response.body;
  if (!stream) return { text: '', partial: false };
  if (stream.locked) return { text: '', partial: true };
  const reader = stream.getReader();
  let expired = false;
  const timeout = setTimeout(() => {
    expired = true;
    void reader.cancel().catch(() => undefined);
  }, errorBodyTimeoutMs);
  timeout.unref();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let bytes = 0;
  let text = '';
  try {
    for (;;) {
      const pending = reader.read();
      const chunk = waitForBody ? await pending : await Promise.race([pending, unavailable]);
      if (!chunk) return { text, partial: true };
      if (chunk.done) return { text: expired ? text : text + decoder.decode(), partial: expired };
      transport.received_bytes += chunk.value.byteLength;
      const keep = Math.min(chunk.value.byteLength, maxErrorBodyBytes - bytes);
      text += decoder.decode(chunk.value.subarray(0, keep), { stream: true });
      bytes += keep;
      if (keep < chunk.value.byteLength) return { text, partial: true };
    }
  } catch {
    return { text, partial: true };
  } finally {
    clearTimeout(timeout);
    void reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

/** 无留存时只解析已就绪的错误信封，不为等待更多字节延迟业务响应。 */
export async function observeModelHttpError(
  transport: Transport,
  response: Response,
  privacy: WirePrivacy,
  capture?: ModelExchangeCapture,
) {
  for (const name of upstreamRequestIdHeaders) {
    const id = identifier(response.headers.get(name), privacy);
    if (id) {
      transport.upstream_request_id = id;
      break;
    }
  }
  const type = response.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase();
  const json = type === 'application/json' || type?.endsWith('+json');
  if (!capture && (!json || Number(response.headers.get('content-length')) > maxErrorBodyBytes)) {
    void response.body?.cancel().catch(() => undefined);
    return;
  }
  const { text, partial } = await readErrorBody(response, transport, !!capture);
  let envelope: Record<string, unknown> | undefined;
  if (!partial && (json || (capture && text.trimStart().startsWith('{')))) {
    try {
      envelope = object(JSON.parse(text));
    } catch {
      // 不能解析的正文只交付脱敏前缀。
    }
  }
  if (!response.ok) capture?.error(envelope ?? text, partial);
  else if (envelope?.error || envelope?.type === 'error') capture?.error(envelope);
  else capture?.unparsed(text, partial, envelope);
  if (json && envelope) observeErrorIdentifiers(transport, envelope, privacy);
}

function observeErrorIdentifiers(
  transport: Transport,
  envelope: Record<string, unknown>,
  privacy: WirePrivacy,
) {
  const error = object(envelope.error);
  for (const value of [error?.code, envelope.code, error?.type]) {
    const code = identifier(
      typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : value,
      privacy,
    );
    if (code) {
      transport.upstream_error_code = code;
      break;
    }
  }
  if (!transport.upstream_request_id) {
    const id = identifier(envelope.request_id, privacy);
    if (id) transport.upstream_request_id = id;
  }
}

/** 连接层异常只取 cause 链上的协议错误码（如 ECONNRESET），不保存异常消息。 */
export function networkErrorCode(error: unknown, privacy?: WirePrivacy) {
  let current: unknown = error;
  for (let depth = 0; depth < 6 && current && typeof current === 'object'; depth++) {
    const code = 'code' in current ? identifier(current.code, privacy) : undefined;
    if (code) return code;
    current = 'cause' in current ? current.cause : undefined;
  }
  return undefined;
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
  let refused = false;
  if (format === 'openai') {
    const choice = object(Array.isArray(frame.choices) ? frame.choices[0] : undefined);
    const delta = object(choice?.delta);
    const content = delta && openAiContent(delta);
    text = content?.text;
    stop = choice?.finish_reason;
    // 兼容端点可能以正常停止加 refusal 字段表示拒答；只记分类，不保存拒答原文。
    refused = hasText(delta?.refusal);
    otherOutput =
      refused ||
      hasText(content?.reasoning) ||
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
  if (refused) transport.finish_reason = 'content_filter';
  else if (typeof stop === 'string' && stop && transport.finish_reason !== 'content_filter')
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
  constructor(
    private readonly format: ModelProfile['format'],
    private readonly capture?: ModelExchangeCapture,
    private readonly privacy = new WirePrivacy(),
  ) {}
  private report(raw: unknown, initial = false) {
    const usage = object(raw);
    if (!usage) return;
    const openai = this.format === 'openai';
    if (openai) {
      const input = tokenCount(usage.prompt_tokens);
      if (input !== null) this.inputTokens = input;
      const reasoning = tokenCount(object(usage.completion_tokens_details)?.reasoning_tokens);
      if (reasoning !== null) this.transport.reasoning_tokens = reasoning;
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
    this.capture?.frame(item);
    if (item.type === 'error' || item.error) {
      observeErrorIdentifiers(this.transport, item, this.privacy);
      throw new AiError('AI_PROVIDER_FAILED', '端点返回错误事件');
    }
    observeModelFrame(this.transport, this.format, item, elapsed);
    if (this.format === 'openai') this.report(item.usage);
    else if (item.type === 'message_start') this.report(object(item.message)?.usage, true);
    else if (item.type === 'message_delta') this.report(item.usage);
    else if (item.type === 'message_stop') this.transport.terminal_received = true;
  }
  observeJson(body: unknown, elapsed: number) {
    const item = object(body);
    if (!item) return;
    this.capture?.json(item);
    if (item.type === 'error' || item.error) {
      observeErrorIdentifiers(this.transport, item, this.privacy);
      return;
    }
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
    private readonly capture?: ModelExchangeCapture,
  ) {}

  incomplete(bytes?: Uint8Array) {
    if (!this.capture) return;
    const tail = bytes ? this.decoder.decode(bytes, { stream: true }) : '';
    this.capture.unparsed(this.buffer + tail, true);
  }

  private append(bytes: Uint8Array) {
    this.buffer += this.decoder.decode(bytes, { stream: true });
    if (this.buffer.length > this.maxFrameChars) {
      this.incomplete();
      throw new AiError('AI_PROVIDER_FAILED', '模型事件帧超过限制');
    }
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
        try {
          this.wire.inspectSseFrame(this.buffer, elapsed);
        } catch (error) {
          if (error instanceof SyntaxError) this.capture?.unparsed(this.buffer);
          throw error;
        }
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
    try {
      this.wire.inspectSseFrame(this.buffer + this.decoder.decode(), elapsed);
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
      this.incomplete();
    }
    if (!this.wire.transport.terminal_received) {
      this.capture?.incomplete();
      throw new AiError('AI_STREAM_INCOMPLETE', '模型流在终止帧之前结束', true);
    }
    return new Uint8Array([10, 10]);
  }
}
