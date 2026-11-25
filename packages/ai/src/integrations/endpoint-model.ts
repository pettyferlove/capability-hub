import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { createAnthropic } from '@ai-sdk/anthropic';
import type { ModelProfile } from '../core/config.js';
import type { ModelCallDiagnostics } from '../core/records.js';

/** 两种协议共用的 SDK 模型对象；Anthropic 模型结构上兼容同一类型。 */
export type EndpointModel = ReturnType<ReturnType<typeof createOpenAICompatible>>;

/**
 * 按模型配置构造 SDK 模型对象；传输（预留、计量、超时、请求头）全部由调用方提供的 `fetch` 负责。
 */
export function createEndpointModel(
  profile: ModelProfile,
  apiKey: string,
  fetch: typeof globalThis.fetch,
): EndpointModel {
  const options = { baseURL: profile.base_url.replace(/\/$/, ''), apiKey, fetch };
  if (profile.format === 'anthropic') return createAnthropic(options)(profile.model);
  return createOpenAICompatible({
    ...options,
    name: 'hub-openai',
    includeUsage: true,
    transformRequestBody:
      profile.chat_max_tokens_field === 'max_completion_tokens'
        ? (body: Record<string, unknown>) => {
            body.max_completion_tokens = body.max_tokens;
            delete body.max_tokens;
            return body;
          }
        : undefined,
  })(profile.model);
}

/** `key` 是 `reasoning_effort_overrides` 的键（`操作/智能体`）；`omit` 时不发送任何思考控制。 */
export function reasoningEffortFor(
  profile: ModelProfile,
  key: string,
): ModelCallDiagnostics['reasoning_effort'] {
  if (profile.thinking_control === 'effort_only')
    return profile.reasoning_effort_overrides?.[key] ?? profile.reasoning_effort;
  if (profile.thinking_control !== 'omit') return 'none';
  return undefined;
}

/** 重设某一步的请求时限，不改变同档案里的其他调用。 */
export function requestTimeoutFor(profile: ModelProfile, key?: string) {
  if (key === undefined) return profile.request_timeout_ms;
  return profile.request_timeout_ms_overrides?.[key] ?? profile.request_timeout_ms;
}

type ReasoningEffort = NonNullable<ModelCallDiagnostics['reasoning_effort']>;

/** 只关闭或限制思考，不传其它供应商参数；返回值直接作为 SDK 的 `providerOptions`。 */
export function endpointProviderOptions(
  profile: ModelProfile,
  effort: ModelCallDiagnostics['reasoning_effort'],
):
  | { anthropic: { thinking: { type: 'disabled' } } | { effort: Exclude<ReasoningEffort, 'none'> } }
  | { hubOpenai: { thinking: { type: 'disabled' } } | { enable_thinking: false } }
  | { openaiCompatible: { reasoningEffort: ReasoningEffort } }
  | undefined {
  if (!effort) return undefined;
  if (profile.format === 'anthropic')
    return { anthropic: effort === 'none' ? { thinking: { type: 'disabled' } } : { effort } };
  if (profile.thinking_control === 'thinking_type')
    return { hubOpenai: { thinking: { type: 'disabled' } } };
  if (profile.thinking_control === 'enable_thinking')
    return { hubOpenai: { enable_thinking: false } };
  return { openaiCompatible: { reasoningEffort: effort } };
}
