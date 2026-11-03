import type { ModelProfile } from '../core/config.js';
import type { ModelCallDiagnostics } from '../core/records.js';

type Transport = NonNullable<ModelCallDiagnostics['transport']>;

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
