export class HubError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details: unknown = {},
    public readonly retryable = false,
  ) {
    super(message);
    this.name = 'HubError';
  }
}
export function fail(status: number, code: string, message: string, details: unknown = {}): never {
  throw new HubError(status, code, message, details);
}
export function notFound(): never {
  return fail(404, 'NOT_FOUND', '资源不存在或无权访问');
}
