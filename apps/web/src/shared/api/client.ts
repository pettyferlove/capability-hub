import { browserUuid } from '@capability-hub/logging/browser';
import {
  hubFeedbackFailedRequestSchema,
  hubVersionHeaders,
  type HubFeedbackFailedRequest,
} from '@capability-hub/contracts';
import { notifyHubFeedbackFailure } from '../hub-feedback-events.js';
import { clearBrowserDiagnostics, reportError } from '../logging.js';
import { readPreviewText } from './preview.js';
import { observeWebBuild } from './web-build.js';

export { PreviewUnavailable } from './preview.js';
let csrfToken = '';
let identityGeneration = 0;
let hubVersion: string | undefined;
const failedRequests: HubFeedbackFailedRequest[] = [];

/** 最近失败仅保留白名单字段，不含请求和响应正文。 */
export function recentFailedRequests(): readonly HubFeedbackFailedRequest[] {
  return failedRequests.slice();
}

/** 最近一次匹配失败用于精确选中触发记录。 */
export function latestFailedRequest(matches: (entry: HubFeedbackFailedRequest) => boolean) {
  for (let i = failedRequests.length - 1; i >= 0; i--) {
    if (matches(failedRequests[i])) return failedRequests[i];
  }
}

/** 未带版本响应头的中间件错误不覆盖最近已知版本。 */
export function latestHubVersion(): string | undefined {
  return hubVersion;
}

function observeResponse(response: Response) {
  const version = response.headers.get(hubVersionHeaders.version);
  if (version && /^\d+\.\d+\.\d+(?:[-+][\w.+-]+)?$/.test(version)) hubVersion = version;
  return observeWebBuild(response);
}

function rememberFailure(
  method: string,
  path: string,
  status: number,
  code: string,
  requestId?: string,
) {
  const safePath = path
    .split(/[?#]/, 1)[0]
    .replace(/^(\/api\/install-tickets\/)[^/]+/, '$1~ticket');
  const parsed = hubFeedbackFailedRequestSchema.safeParse({
    at: new Date().toISOString(),
    method,
    path: safePath,
    status,
    code: /^[A-Za-z0-9_]{1,80}$/.test(code) ? code : 'REQUEST_FAILED',
    request_id: requestId && /^[0-9a-f-]{36}$/i.test(requestId) ? requestId : undefined,
  });
  if (!parsed.success) return;
  if (failedRequests.length === 20) failedRequests.shift();
  failedRequests.push(parsed.data);
  return parsed.data;
}

function notifyRequestFailure(status: number, code: string, request?: HubFeedbackFailedRequest) {
  notifyHubFeedbackFailure({
    status,
    code: request?.code ?? code,
    seed: request ? { request } : {},
  });
}

function networkFailure(error: unknown, path: string, options: RequestInit, generation: number) {
  if (
    options.signal?.aborted ||
    (error !== null && typeof error === 'object' && 'name' in error && error.name === 'AbortError')
  )
    throw error;
  if (generation !== identityGeneration) return;
  const failure = rememberFailure(options.method ?? 'GET', path, 0, 'NETWORK_ERROR');
  notifyRequestFailure(0, 'NETWORK_ERROR', failure);
  return failure;
}

function fetchRequest(path: string, options: RequestInit) {
  const generation = identityGeneration;
  return fetch(path, options).catch((error: unknown) => {
    networkFailure(error, path, options, generation);
    throw error;
  });
}

/** 核验新会话时即使令牌仍为空，也必须隔离此前发出的请求。 */
export function setCsrf(value: string, newSession = false): void {
  if (newSession || value !== csrfToken) identityGeneration++;
  if (value !== csrfToken) {
    failedRequests.length = 0;
    clearBrowserDiagnostics();
  }
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
    readonly failure?: HubFeedbackFailedRequest,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** 只把可显示和预览的请求上下文交给错误组件。 */
export interface ApiErrorContext {
  status?: number;
  requestId?: string;
  failure?: HubFeedbackFailedRequest;
}

/** 非请求异常没有可预选的请求诊断。 */
export function apiErrorContext(error: unknown): ApiErrorContext | undefined {
  return error instanceof ApiError
    ? { status: error.status, requestId: error.requestId, failure: error.failure }
    : undefined;
}

async function responseError(
  response: Response,
  path: string,
  generation: number,
  method = 'GET',
): Promise<ApiError> {
  return httpFailure(
    await response.json().catch(() => null),
    response.status,
    path,
    method,
    response.headers.get('X-Request-Id'),
    generation,
  );
}

function httpFailure(
  body: unknown,
  status: number,
  path: string,
  method: string,
  headerId: string | null,
  generation: number,
): ApiError {
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
    ('request_id' in detail && typeof detail.request_id === 'string' && detail.request_id) ||
    headerId ||
    '';
  if (generation !== identityGeneration) return new ApiError(status, code, message, requestId);
  const failure = rememberFailure(method, path, status, code, requestId);
  reportError('http.failed', {
    status,
    code,
    requestId: requestId || undefined,
  });
  if (status >= 500 && status <= 599) notifyRequestFailure(status, 'REQUEST_FAILED', failure);
  if (status === 401 && !path.startsWith('/auth/') && path !== '/api/me')
    window.dispatchEvent(new Event('hub:unauthenticated'));
  return new ApiError(status, code, message, requestId, failure);
}

/**
 * JSON 传输边界；调用方显式使用共享响应类型。
 *
 * 写请求自动带 `X-CSRF-Token`（值来自 {@link setCsrf}）与未显式提供时的 `Idempotency-Key`，
 * 因此重试同一调用不要自己生成 key，否则服务端会当成两次操作。
 * `redirect: 'error'` 用来暴露登录重定向，避免把 HTML 登录页当 JSON 解析。
 * 非 2xx 一律抛 {@link ApiError}；仅当前身份的非 `/auth/*`、非 `/api/me` 请求遇到 401 时
 * 派发 `hub:unauthenticated`。204 返回 `undefined`，调用方不要解构结果。
 */
export async function api<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await apiResponse(path, options);
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

async function apiResponse(path: string, options: RequestInit): Promise<Response> {
  const generation = identityGeneration;
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
  }).catch((error: unknown) => {
    const failure = networkFailure(error, path, options, generation);
    if (generation === identityGeneration) reportError('http.failed', { error });
    throw new ApiError(
      0,
      'NETWORK_ERROR',
      error instanceof Error ? error.message : '暂时无法连接服务，请稍后重试',
      '',
      failure,
    );
  });
  observeResponse(response);
  if (!response.ok) throw await responseError(response, path, generation, options.method);
  return response;
}

/** 返回标签页或懒加载失败时探测，绕开缓存且不依赖会话。 */
export async function checkWebBuild(): Promise<string | null> {
  const response = await fetchRequest('/health/live', {
    method: 'HEAD',
    cache: 'no-store',
    credentials: 'same-origin',
    redirect: 'error',
    signal: AbortSignal.timeout(3000),
  });
  if (response.status >= 500 && response.status <= 599)
    notifyRequestFailure(response.status, 'REQUEST_FAILED');
  return response.ok ? observeResponse(response) : null;
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
  const generation = identityGeneration;
  const url = `/api/${management ? 'management/' : ''}versions/${version}/files?path=${encodeURIComponent(path)}`;
  const response = await fetchRequest(url, {
    credentials: 'same-origin',
    redirect: 'error',
    signal,
  });
  observeResponse(response);
  if (!response.ok) throw await responseError(response, url, generation);
  return readPreviewText(response);
}

/** 只下载明确选中的固定版本；按当前浏览器身份读取，不创建安装票据。 */
export async function downloadSkillBundle(
  versionIds: readonly string[],
  signal: AbortSignal,
): Promise<Blob> {
  const query = new URLSearchParams();
  for (const id of versionIds) query.append('version_id', id);
  const response = await apiResponse(`/api/catalog/skill-bundle?${query}`, {
    signal,
    cache: 'no-store',
    headers: { Accept: 'application/zip' },
  });
  if (response.headers.get('Content-Type')?.split(';')[0] !== 'application/zip')
    throw new Error('服务未返回 Skill 压缩包');
  return response.blob();
}

/** 文本附件预览保留的行数；完整内容仍通过下载获取。 */
export const hubFeedbackPreviewLines = 200;

/** 文本附件保留原始下载，只在处理详情里展示前若干行；`lines` 是附件总行数。 */
export async function hubFeedbackAttachmentText(
  path: string,
  signal?: AbortSignal,
): Promise<{ text: string; lines: number }> {
  const generation = identityGeneration;
  const response = await fetchRequest(path, {
    credentials: 'same-origin',
    redirect: 'error',
    signal,
  });
  observeResponse(response);
  if (!response.ok) throw await responseError(response, path, generation);
  const lines = (await response.text()).split(/\r\n?|\n/);
  // 末尾换行不构成新的一行，否则恰好满额的附件会被误报为截断。
  if (lines.at(-1) === '') lines.pop();
  return { text: lines.slice(0, hubFeedbackPreviewLines).join('\n'), lines: lines.length };
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
  const generation = identityGeneration;
  const response = await fetchRequest(path, {
    credentials: 'same-origin',
    redirect: 'error',
    signal,
    headers: {
      Accept: 'text/event-stream',
      ...(lastEventId ? { 'Last-Event-ID': lastEventId } : {}),
    },
  });
  observeResponse(response);
  if (!response.ok) throw await responseError(response, path, generation);
  if (!response.body || !response.headers.get('content-type')?.includes('text/event-stream'))
    throw new ApiError(502, 'STREAM_INVALID', '事件连接不可用');
  await readEvents(response.body, onEvent);
}

async function readEvents(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: ServerEvent) => void,
): Promise<void> {
  const reader = body.getReader();
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

/**
 * 以 POST 发起 SSE 请求：与 {@link api} 一样带 CSRF 令牌和幂等键，只接受成功的事件流。
 * 非 2xx 抛 {@link ApiError}；开始推送后的失败以 `error` 帧送达，同样记录并抛出。
 */
export async function postEvents(
  path: string,
  body: unknown,
  onEvent: (event: ServerEvent) => void,
  signal: AbortSignal,
): Promise<void> {
  const generation = identityGeneration;
  const response = await apiResponse(path, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { Accept: 'text/event-stream' },
    signal,
  });
  const type = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
  if (!response.body || type !== 'text/event-stream') {
    await response.body?.cancel().catch(() => undefined);
    throw new ApiError(502, 'STREAM_INVALID', '事件连接不可用');
  }
  await readEvents(response.body, (event) => {
    if (event.event !== 'error') return onEvent(event);
    const detail = event.data;
    if (
      !detail ||
      typeof detail !== 'object' ||
      !('status' in detail) ||
      typeof detail.status !== 'number' ||
      !Number.isInteger(detail.status) ||
      detail.status < 400 ||
      detail.status > 599
    )
      throw new ApiError(502, 'STREAM_INVALID', '事件连接不可用');
    throw httpFailure(
      detail,
      detail.status,
      path,
      'POST',
      response.headers.get('X-Request-Id'),
      generation,
    );
  });
}
