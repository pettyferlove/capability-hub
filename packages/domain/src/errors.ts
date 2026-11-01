/**
 * 领域层唯一对外的失败载体，由 HTTP 错误中间件原样映射成 `{ error: { code, message, details, retryable } }`，
 * 所以 `status` 必须是最终对客户端可见的状态码、`code` 必须是稳定的机器可读错误码（不得随文案变化）。
 * `details` 会一并回显给客户端，只放可公开的字段，不放内部堆栈或凭据。
 * `retryable` 表示同一请求稍后重试有望成功（如上游超时），客户端据此决定是否重试；
 * 冲突类的 409/422 一律不可重试。未归类的异常由中间件降级成 500 `INTERNAL_ERROR`。
 */
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
/**
 * 抛出 {@link HubError} 的简写；返回类型为 `never`，调用处不必再补 `return`。
 * 默认不可重试，需要重试语义请直接 `new HubError(..., true)`。
 *
 * @param status - 最终返回给客户端的 HTTP 状态码
 * @param code - 稳定的大写下划线错误码，客户端按它分支
 * @param message - 面向用户的简体中文说明，不承载程序逻辑
 * @param details - 可公开的补充字段，会原样回显
 */
export function fail(status: number, code: string, message: string, details: unknown = {}): never {
  throw new HubError(status, code, message, details);
}
/**
 * 统一的 404：资源不存在与无权查看共用同一响应，避免通过状态码差异探测他人资源。
 */
export function notFound(): never {
  return fail(404, 'NOT_FOUND', '资源不存在或无权访问');
}
