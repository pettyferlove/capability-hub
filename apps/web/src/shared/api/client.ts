import { reportError } from '../logging.js';
import { readPreviewText } from './preview.js';
export { PreviewUnavailable } from './preview.js';
let csrfToken = '';
export function setCsrf(value: string): void {
  csrfToken = value;
}
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
/** JSON 传输边界；调用方显式使用共享响应类型。 */
export async function api<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !(options.body instanceof FormData))
    headers.set('Content-Type', 'application/json');
  if (options.method && !['GET', 'HEAD'].includes(options.method)) {
    headers.set('X-CSRF-Token', csrfToken);
    if (!headers.has('Idempotency-Key')) headers.set('Idempotency-Key', crypto.randomUUID());
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
export interface ServerEvent {
  event: string;
  id: string;
  data: unknown;
}
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
