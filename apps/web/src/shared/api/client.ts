import { browserUuid } from '@capability-hub/logging/browser';
import { reportError } from '../logging.js';
import { readPreviewText } from './preview.js';

export { PreviewUnavailable } from './preview.js';
let csrfToken = '';

/** 注入 CSRF 令牌来源：由 `use-session` 在登录/刷新会话成功后写入，退出或失败时清空。 */
export function setCsrf(value: string): void {
  csrfToken = value;
}

/**
 * 非 2xx 响应的统一形状，`message` 可直接展示给用户，`status`/`code`/`requestId` 供报障与分支判断。
 * 401 的副作用已在 {@link api} 里处理完（派发 `hub:unauthenticated`），调用方通常只需展示 `message`。
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly requestId = '',
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function responseError(response: Response, path: string): Promise<ApiError> {
  const body: unknown = await response.json().catch(() => null);
  const detail =
    body &&
    typeof body === 'object' &&
    'error' in body &&
    body.error &&
    typeof body.error === 'object'
      ? body.error
      : {};
  const code = 'code' in detail && typeof detail.code === 'string' ? detail.code : 'REQUEST_FAILED';
  const message =
    'message' in detail && typeof detail.message === 'string'
      ? detail.message
      : '请求失败，请稍后重试';
  const requestId =
    'request_id' in detail && typeof detail.request_id === 'string' ? detail.request_id : '';
  if (response.status === 401 && !path.startsWith('/auth/') && path !== '/api/me')
    window.dispatchEvent(new Event('hub:unauthenticated'));
  reportError('http.failed', {
    status: response.status,
    code,
    requestId: requestId || response.headers.get('X-Request-Id') || undefined,
  });
  return new ApiError(response.status, code, message, requestId);
}

/**
 * JSON 传输边界；调用方显式使用共享响应类型。
 *
 * 写请求自动带 `X-CSRF-Token`（值来自 {@link setCsrf}）与未显式提供时的 `Idempotency-Key`，
 * 因此重试同一调用不要自己生成 key，否则服务端会当成两次操作。
 * `redirect: 'error'` 用来暴露登录重定向，避免把 HTML 登录页当 JSON 解析。
 * 非 2xx 一律抛 {@link ApiError}；401 且目标不是 `/auth/*` 或 `/api/me` 时还会派发
 * `hub:unauthenticated`，让全局退回登录态。204 返回 `undefined`，调用方不要解构结果。
 */
export async function api<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !(options.body instanceof FormData))
    headers.set('Content-Type', 'application/json');
  if (options.method && !['GET', 'HEAD'].includes(options.method)) {
    headers.set('X-CSRF-Token', csrfToken);
    if (!headers.has('Idempotency-Key')) headers.set('Idempotency-Key', browserUuid());
  }
  const response = await fetch(path, {
    ...options,
    headers,
    credentials: 'same-origin',
    redirect: 'error',
  }).catch((error) => {
    if (!(error instanceof DOMException && error.name === 'AbortError'))
      reportError('http.failed', { error });
    throw error;
  });
  if (!response.ok) throw await responseError(response, path);
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

/**
 * 写操作的便捷封装：`revision` 会变成带引号的 `If-Match`，服务端据此做乐观并发校验，
 * 版本已变时返回 412 并抛 {@link ApiError}，调用方应提示刷新而不是静默重试。
 * 未传 `revision` 时不带条件头；要求并发校验的接口会以 428/`IF_MATCH_REQUIRED` 拒绝。
 */
export function mutate<T = void>(
  path: string,
  body: unknown,
  method = 'POST',
  revision?: number,
): Promise<T> {
  return api<T>(path, {
    method,
    body: JSON.stringify(body),
    headers: revision !== undefined ? { 'If-Match': `"${revision}"` } : undefined,
  });
}

/**
 * 读取归档内单个文件的预览文本。`management` 为真时读候选版本（需登录且通过候选访问授权，
 * 服务端会写管理读取审计），否则只读已发布版本；同一 `path` 两条路径的可见性不同，不要混用。
 *
 * @param version - 版本 id 而非资产 id，预览始终指向具体版本。
 * @param signal - 取消信号；版本切换时必须 abort，否则迟到响应会覆盖当前文件内容。
 */
export async function fileText(
  version: string,
  path: string,
  management = false,
  signal?: AbortSignal,
): Promise<string> {
  const url = `/api/${management ? 'management/' : ''}versions/${version}/files?path=${encodeURIComponent(path)}`;
  const response = await fetch(url, { credentials: 'same-origin', redirect: 'error', signal });
  if (!response.ok) throw await responseError(response, url);
  return readPreviewText(response);
}

/** SSE 帧被解析后的形状；`data` 已按 JSON 解析，解析失败会中断整条流而不是跳过该帧。 */
export interface ServerEvent {
  /** 帧的 `event:` 字段，缺省为 `message`。 */
  event: string;
  /** 帧的 `id:` 字段，缺省为空串；回传它可让服务端从断点续推。 */
  id: string;
  data: unknown;
}

/**
 * 订阅 SSE：连接前带上 `Last-Event-ID` 续传，收到 `data:` 才回调（心跳与注释帧被忽略）。
 * 单条流累计缓冲超过 8MB 抛 502/`STREAM_LIMIT`，防止服务端异常输出撑爆内存。
 * 返回即代表正常结束或 `signal` 被 abort；读流会在 `finally` 中取消并释放锁，不会留下悬挂连接。
 */
export async function streamEvents(
  path: string,
  onEvent: (event: ServerEvent) => void,
  signal: AbortSignal,
  lastEventId?: string,
): Promise<void> {
  const response = await fetch(path, {
    credentials: 'same-origin',
    redirect: 'error',
    signal,
    headers: {
      Accept: 'text/event-stream',
      ...(lastEventId ? { 'Last-Event-ID': lastEventId } : {}),
    },
  });
  if (!response.ok) throw await responseError(response, path);
  if (!response.body || !response.headers.get('content-type')?.includes('text/event-stream'))
    throw new ApiError(502, 'STREAM_INVALID', '事件连接不可用');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) return;
      buffer += decoder.decode(chunk.value, { stream: true });
      if (buffer.length > 8_000_000) throw new ApiError(502, 'STREAM_LIMIT', '事件内容超过限制');
      let match: RegExpExecArray | null;
      while ((match = /\r?\n\r?\n/.exec(buffer))) {
        const frame = buffer.slice(0, match.index);
        buffer = buffer.slice(match.index + match[0].length);
        let event = 'message';
        let id = '';
        const data: string[] = [];
        for (const line of frame.split(/\r?\n/)) {
          if (line.startsWith('event:')) event = line.slice(6).trim();
          else if (line.startsWith('id:')) id = line.slice(3).trim();
          else if (line.startsWith('data:')) data.push(line.slice(5).trimStart());
        }
        if (data.length) onEvent({ event, id, data: JSON.parse(data.join('\n')) as unknown });
      }
    }
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
