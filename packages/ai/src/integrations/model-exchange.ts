import type { ModelProfile } from '../core/config.js';
import type { Json, ModelExchangePayload } from '../core/records.js';
import { openAiContent, WirePrivacy, wireObject as object } from './wire-content.js';

const requestLimit = 1_048_576;
const textLimit = 524_288;
const reasoningLimit = 262_144;
const toolLimit = 262_144;
const errorBodyLimit = 8192;
const maxToolCalls = 200;

type ExchangeResponse = NonNullable<ModelExchangePayload['response']>;

function label(value: unknown, limit: number) {
  return typeof value === 'string' && value ? value.slice(0, limit) : undefined;
}

/** 按 UTF-8 字节上限累积文本；超出部分整字符截去，并记下已截断。 */
class BoundedText {
  value = '';
  truncated = false;
  private bytes = 0;
  constructor(private readonly limit: number) {}
  append(text: unknown) {
    if (typeof text !== 'string' || !text || this.truncated) return;
    const size = Buffer.byteLength(text);
    if (this.bytes + size <= this.limit) {
      this.value += text;
      this.bytes += size;
      return;
    }
    for (const char of text) {
      const charBytes = Buffer.byteLength(char);
      if (this.bytes + charBytes > this.limit) break;
      this.value += char;
      this.bytes += charBytes;
    }
    this.truncated = true;
  }
}

/** 工具调用按协议给出的序号合并分片参数，所有参数共用一个字节上限。 */
class ToolCalls {
  truncated = false;
  private readonly items = new Map<string, { id?: string; name: string; arguments: string }>();
  private bytes = 0;
  touch(key: string, id: unknown, name: unknown) {
    if (this.truncated) return;
    let item = this.items.get(key);
    if (!item) {
      if (this.items.size >= maxToolCalls) {
        this.truncated = true;
        return;
      }
      item = { name: '', arguments: '' };
      this.items.set(key, item);
    }
    item.id ??= label(id, 200);
    if (!item.name) item.name = label(name, 200) ?? '';
  }
  append(key: string, text: unknown) {
    if (this.truncated) return;
    const item = this.items.get(key);
    if (!item || typeof text !== 'string' || !text) return;
    const size = Buffer.byteLength(text);
    if (this.bytes + size > toolLimit) {
      const prefix = new BoundedText(toolLimit - this.bytes);
      prefix.append(text);
      item.arguments += prefix.value;
      this.truncated = true;
      return;
    }
    item.arguments += text;
    this.bytes += size;
  }
  onlyKey() {
    return this.items.size === 1 ? this.items.keys().next().value : undefined;
  }
  list(privacy: WirePrivacy, partial: boolean) {
    return [...this.items.values()].map(({ id, name, arguments: args }) => ({
      ...(id && { id: privacy.text(id, id.length === 200) }),
      name: privacy.text(name, name.length === 200),
      arguments: privacy.text(args, this.truncated || partial),
    }));
  }
}

/**
 * 采集一次模型请求的往返原文：请求体按实际出站内容保存，响应按协议还原正文、推理、工具调用、
 * 停止原因与原始用量。采集只读取已在内存中的帧，不改变传输行为；各部分按字节上限截断。
 */
export class ModelExchangeCapture {
  private request: ModelExchangePayload['request'] = { bytes: 0, truncated: false };
  private received = false;
  private responseId: string | undefined;
  private finish: string | undefined;
  private usage: Record<string, unknown> | undefined;
  private readonly errorBody = new BoundedText(errorBodyLimit);
  private hasError = false;
  private partial = false;
  private privacy = new WirePrivacy();
  private readonly text = new BoundedText(textLimit);
  private readonly reasoning = new BoundedText(reasoningLimit);
  private readonly raw = new BoundedText(textLimit);
  private readonly tools = new ToolCalls();
  private readonly blocks = new Map<number, string>();
  private readonly toolKeys = new Map<string, string>();
  constructor(private readonly format: ModelProfile['format']) {}

  sent(body: unknown, privacy?: WirePrivacy) {
    if (privacy) this.privacy = privacy;
    const text =
      typeof body === 'string'
        ? body
        : body instanceof Uint8Array
          ? new TextDecoder().decode(body)
          : undefined;
    if (text === undefined) return;
    const bytes = Buffer.byteLength(text);
    this.request = { bytes, truncated: bytes > requestLimit };
    if (bytes <= requestLimit)
      try {
        this.request.body = this.privacy.json(JSON.parse(text) as Json);
        return;
      } catch {
        // 非 JSON 请求体按文本保存。
      }
    const kept = new BoundedText(requestLimit);
    kept.append(text);
    this.request.text = this.privacy.text(kept.value, kept.truncated);
  }

  responded() {
    this.received = true;
  }

  error(value: string | Record<string, unknown>, partial = false) {
    this.received = true;
    this.hasError = true;
    this.partial ||= partial;
    this.errorBody.append(
      typeof value === 'string'
        ? this.privacy.errorPrefix(value, partial)
        : this.privacy.error(value),
    );
  }

  /** 端点返回了无法解析的响应体。 */
  unparsed(text: string, partial = false) {
    this.received = true;
    this.partial ||= partial;
    this.raw.append(this.privacy.text(text, partial));
  }

  incomplete() {
    this.partial = true;
  }

  frame(item: Record<string, unknown>) {
    this.received = true;
    if (item.type === 'error' || item.error) {
      this.error(item);
      return;
    }
    if (this.format === 'openai') this.openai(item, 'delta');
    else this.anthropicFrame(item);
  }

  json(item: Record<string, unknown>) {
    this.received = true;
    if (item.type === 'error' || item.error) {
      this.error(item);
      return;
    }
    if (this.format === 'openai') {
      this.openai(item, 'message');
      return;
    }
    this.responseId ??= label(item.id, 200);
    if (Array.isArray(item.content))
      for (const [index, block] of item.content.entries()) this.startBlock(index, object(block));
    this.finish = label(item.stop_reason, 64) ?? this.finish;
    this.mergeUsage(item.usage);
  }

  private openai(item: Record<string, unknown>, field: 'delta' | 'message') {
    this.responseId ??= label(item.id, 200);
    const choice = object(Array.isArray(item.choices) ? item.choices[0] : undefined);
    const part = object(choice?.[field]);
    if (part) {
      const content = openAiContent(part);
      this.text.append(content.text);
      this.reasoning.append(content.reasoning);
      if (Array.isArray(part.tool_calls))
        for (const [position, raw] of part.tool_calls.entries()) {
          const call = object(raw);
          if (!call) continue;
          if (this.tools.truncated) break;
          const id = typeof call.id === 'string' && call.id.trim() ? `id:${call.id}` : undefined;
          const index = typeof call.index === 'number' ? `index:${call.index}` : undefined;
          const key =
            (index && this.toolKeys.get(index)) ||
            (id && this.toolKeys.get(id)) ||
            index ||
            id ||
            (field === 'message' ? `position:${position}` : this.tools.onlyKey());
          if (
            !key ||
            (this.toolKeys.size >= 2 * maxToolCalls &&
              ((id && !this.toolKeys.has(id)) || (index && !this.toolKeys.has(index))))
          ) {
            this.tools.truncated = true;
            break;
          }
          if (index) this.toolKeys.set(index, key);
          if (id) this.toolKeys.set(id, key);
          const fn = object(call.function);
          this.tools.touch(key, call.id, fn?.name);
          this.tools.append(key, fn?.arguments);
        }
    }
    this.finish = label(choice?.finish_reason, 64) ?? this.finish;
    if (object(item.usage)) this.usage = object(item.usage);
  }

  private anthropicFrame(item: Record<string, unknown>) {
    const index = typeof item.index === 'number' ? item.index : -1;
    if (item.type === 'message_start') {
      const message = object(item.message);
      this.responseId ??= label(message?.id, 200);
      this.mergeUsage(message?.usage);
    } else if (item.type === 'content_block_start') {
      this.startBlock(index, object(item.content_block));
    } else if (item.type === 'content_block_delta') {
      const delta = object(item.delta);
      const kind = this.blocks.get(index);
      if (delta?.type === 'text_delta') this.text.append(delta.text);
      else if (delta?.type === 'thinking_delta') this.reasoning.append(delta.thinking);
      else if (delta?.type === 'input_json_delta' && kind === 'tool')
        this.tools.append(String(index), delta.partial_json);
    } else if (item.type === 'message_delta') {
      this.finish = label(object(item.delta)?.stop_reason, 64) ?? this.finish;
      this.mergeUsage(item.usage);
    }
  }

  private startBlock(index: number, block: Record<string, unknown> | undefined) {
    if (block?.type === 'text') {
      this.blocks.set(index, 'text');
      this.text.append(block.text);
    } else if (block?.type === 'thinking') {
      this.blocks.set(index, 'thinking');
      this.reasoning.append(block.thinking);
    } else if (block?.type === 'tool_use') {
      this.blocks.set(index, 'tool');
      this.tools.touch(String(index), block.id, block.name);
      const input = object(block.input);
      if (input && Object.keys(input).length)
        this.tools.append(String(index), JSON.stringify(input));
    }
  }

  /** Messages 的起始帧与增量帧分别报告输入和输出用量，按字段合并为最终值。 */
  private mergeUsage(raw: unknown) {
    const usage = object(raw);
    if (usage) this.usage = { ...this.usage, ...usage };
  }

  payload(resourceRefs: readonly string[]): ModelExchangePayload {
    const response: ExchangeResponse | null = this.received
      ? {
          ...(this.responseId && {
            response_id: this.privacy.text(this.responseId, this.responseId.length === 200),
          }),
          text: this.privacy.text(this.text.value, this.text.truncated || this.partial),
          reasoning: this.privacy.text(
            this.reasoning.value,
            this.reasoning.truncated || this.partial,
          ),
          tool_calls: this.tools.list(this.privacy, this.partial),
          ...(this.finish && {
            finish_reason: this.privacy.text(this.finish, this.finish.length === 64),
          }),
          ...(this.usage && { usage: this.privacy.json(this.usage as Json) }),
          ...(this.hasError && { error_body: this.errorBody.value }),
          ...(this.raw.value && { raw: this.raw.value }),
          truncated:
            this.partial ||
            this.errorBody.truncated ||
            this.text.truncated ||
            this.reasoning.truncated ||
            this.tools.truncated ||
            this.raw.truncated,
        }
      : null;
    return { resource_refs: [...new Set(resourceRefs)], request: this.request, response };
  }
}
