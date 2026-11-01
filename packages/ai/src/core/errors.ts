import { MastraError } from '@mastra/core/error';

/**
 * AI 层错误码，`AiError.code` 一律取这里的值，宿主据此映射 HTTP 状态与是否可重试：
 * `AI_REVISION_CONFLICT`/`AI_CONFLICT` 属于并发冲突（调用方需重新读取），`AI_LEASE_LOST`
 * 表示调度权已被替换（不能继续写库），`AI_RECOVERY_UNCERTAIN` 表示恢复期的证据不足或对不上，
 * `AI_INTERRUPTED` 是可在期限内重排的唯一信号。
 */
export type AiErrorCode =
  | 'AI_CONFIGURATION'
  | 'AI_NOT_FOUND'
  | 'AI_FORBIDDEN'
  | 'AI_CONFLICT'
  | 'AI_REVISION_CONFLICT'
  | 'AI_LEASE_LOST'
  | 'AI_BUDGET_EXCEEDED'
  | 'AI_DEADLINE_EXCEEDED'
  | 'AI_PROVIDER_FAILED'
  | 'AI_STREAM_INCOMPLETE'
  | 'AI_OUTPUT_INVALID'
  | 'AI_RECOVERY_UNCERTAIN'
  | 'AI_CANCELLED'
  | 'AI_INTERRUPTED'
  | 'AI_INTERNAL';

/**
 * AI 层的统一异常。`message` 会原样写入执行记录并可能回传给调用方，因此只允许放可公开的说明，
 * 不得包含凭据、模型原文或供应商响应。`retryable` 只是给宿主的提示，运行时不会据此自动重试。
 */
export class AiError extends Error {
  constructor(
    readonly code: AiErrorCode,
    message: string,
    readonly retryable = false,
  ) {
    super(message);
    this.name = 'AiError';
  }
}
/**
 * 把任意异常收敛为 {@link AiError}：Mastra 的结构化输出类错误统一改成 `AI_OUTPUT_INVALID`
 * （原文可能含模型输出，消息固定为中文说明），其它异常一律降级为 `AI_INTERNAL`，避免内部堆栈
 * 或供应商响应外泄。已是的 `AiError` 原样返回。
 */
export function aiFailure(error: unknown): AiError {
  if (error instanceof MastraError) {
    const messages: Record<string, string> = {
      STRUCTURED_OUTPUT_SCHEMA_VALIDATION_FAILED: '模型结构化结果的字段或类型不符合约定',
      STRUCTURED_OUTPUT_OBJECT_UNDEFINED: '模型未生成结构化结果',
      STRUCTURED_OUTPUT_TRUNCATED: '模型结构化结果因输出长度限制被截断',
    };
    const message = messages[error.id];
    if (message) return new AiError('AI_OUTPUT_INVALID', message);
  }
  return error instanceof AiError ? error : new AiError('AI_INTERNAL', 'AI 执行失败');
}
