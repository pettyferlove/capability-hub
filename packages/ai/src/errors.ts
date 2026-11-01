import { MastraError } from '@mastra/core/error';

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
