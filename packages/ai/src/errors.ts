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
  return error instanceof AiError ? error : new AiError('AI_INTERNAL', 'AI 执行失败');
}
