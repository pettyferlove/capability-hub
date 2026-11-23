import type { z } from 'zod';
import { boundedJson } from '@capability-hub/infrastructure/content/json';
import { secretFindings } from '@capability-hub/infrastructure/content/secret-detection';
import { observeCliResponse } from './update-notice.js';

export interface HubApiRequestOptions {
  method?: string;
  idempotencyKey?: string;
  ifMatch?: string;
  signal?: AbortSignal;
}

interface HubApiErrorOptions extends ErrorOptions {
  requestId?: string;
  origin?: string;
}

/**
 * Hub 返回非 2xx 时抛出的错误：`status` 是 HTTP 状态码，`code` 是 Hub 错误码，
 * 调用方应按 `code` 分支（例如 `invalid_grant` 提示重新授权），不要解析拼接后的 `message`。
 */
export class HubApiError extends Error {
  readonly requestId?: string;
  readonly origin?: string;

  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    options?: HubApiErrorOptions,
  ) {
    super(`${code}: ${message}`, options);
    const cause = options?.cause instanceof HubApiError ? options.cause : undefined;
    this.requestId = safeRequestId(options?.requestId) ?? cause?.requestId;
    this.origin = httpOrigin(options?.origin) ?? cause?.origin;
  }
}

const oauthMessages: Record<string, string> = {
  invalid_grant: '授权已失效，请重新运行 connect 完成浏览器授权',
  invalid_client: '客户端注册已失效，请重新连接',
  invalid_scope: '请求的权限未获授权，请重新确认所需能力',
  invalid_target: '授权目标与当前 Hub 不一致',
  invalid_request: '授权请求格式无效',
  temporarily_unavailable: '授权服务繁忙，请稍后重试',
};

/**
 * CLI 侧最小的 Hub 客户端：不跟随重定向（`redirect: 'error'`），普通请求整体 30 秒超时，
 * 非 2xx 一律转成 {@link HubApiError}，错误体按固定上限读取并清洗控制字符后才写入终端，
 * 因此 Hub 返回的文本无法向用户终端注入转义序列。
 * 响应体同样有上限：JSON 1 MiB、归档 120 MiB，超出即中止读取。
 */
export class HubApiClient {
  constructor(
    readonly url: string,
    private readonly token?: string,
  ) {}

  async request(
    path: string,
    body?: unknown,
    signal: AbortSignal = AbortSignal.timeout(30000),
    options?: HubApiRequestOptions,
  ): Promise<Response> {
    const multipart = body instanceof FormData;
    const response = await fetch(this.url + path, {
      method: options?.method ?? (body === undefined ? 'GET' : 'POST'),
      redirect: 'error',
      headers: {
        ...(this.token ? { Authorization: 'Bearer ' + this.token } : {}),
        ...(body === undefined || multipart ? {} : { 'Content-Type': 'application/json' }),
        ...(options?.idempotencyKey === undefined
          ? {}
          : { 'Idempotency-Key': options.idempotencyKey }),
        ...(options?.ifMatch === undefined ? {} : { 'If-Match': options.ifMatch }),
      },
      body: multipart ? body : JSON.stringify(body),
      signal: options?.signal ? AbortSignal.any([signal, options.signal]) : signal,
    });
    observeCliResponse(this.url, response);
    if (!response.ok) {
      let detail: unknown;
      try {
        detail = boundedJson((await this.readBytes(response, 1024 * 1024)).toString());
      } catch {
        /* 非 JSON 错误只报告 HTTP 状态，不打印未校验的响应体。 */
      }
      const error =
        detail && typeof detail === 'object' && 'error' in detail ? detail.error : undefined;
      const errorOptions = {
        requestId: responseRequestId(
          response,
          error && typeof error === 'object' && 'request_id' in error
            ? error.request_id
            : undefined,
          this.token,
        ),
        origin: this.url,
      };
      if (typeof error === 'string') {
        const code = Object.hasOwn(oauthMessages, error) ? error : 'OAUTH_ERROR';
        throw new HubApiError(
          response.status,
          code,
          oauthMessages[code] ?? '授权失败，请检查连接状态后重试',
          errorOptions,
        );
      }
      const code =
        error &&
        typeof error === 'object' &&
        'code' in error &&
        typeof error.code === 'string' &&
        /^[A-Z0-9_]{1,80}$/.test(error.code) &&
        redactCredentials(error.code, this.token) === error.code
          ? error.code
          : String(response.status);
      const message =
        error &&
        typeof error === 'object' &&
        'message' in error &&
        typeof error.message === 'string'
          ? redactCredentials(error.message, this.token).slice(0, 500)
          : '请求失败';
      throw new HubApiError(response.status, code, message, errorOptions);
    }
    return response;
  }

  async json<T>(
    path: string,
    schema: z.ZodType<T>,
    body?: unknown,
    options?: HubApiRequestOptions,
  ): Promise<T> {
    const response = await this.request(path, body, undefined, options);
    const parsed = schema.safeParse(
      boundedJson((await this.readBytes(response, 1024 * 1024)).toString()),
    );
    if (!parsed.success) throw new Error('Hub 响应结构无效');
    return parsed.data;
  }

  /**
   * 归档可达上百 MiB，整体时限会中断仍在传输的慢速下载；30 秒只约束建连、响应头
   * 以及相邻两段数据之间的间隔。
   */
  async archive(
    path: string,
    onProgress?: (received: number, total?: number) => void,
    signal?: AbortSignal,
  ): Promise<Buffer> {
    const controller = new AbortController();
    let timer: NodeJS.Timeout | undefined;
    const arm = () => {
      clearTimeout(timer);
      timer = setTimeout(
        () => controller.abort(new Error('下载超过 30 秒没有收到新数据，已中止')),
        30000,
      );
    };
    arm();
    try {
      const response = await this.request(path, undefined, controller.signal, { signal });
      return await this.readBytes(response, 120 * 1024 * 1024, (received, total) => {
        arm();
        onProgress?.(received, total);
      });
    } finally {
      clearTimeout(timer);
    }
  }

  private async readBytes(
    response: Response,
    maximum: number,
    onProgress?: (received: number, total?: number) => void,
  ): Promise<Buffer> {
    if (!response.body) throw new Error('Hub 返回了空响应');
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    const length = Number(response.headers.get('content-length'));
    // 压缩传输的 Content-Length 不能表示 fetch 解压后的字节数。
    const total =
      !response.headers.has('content-encoding') &&
      Number.isSafeInteger(length) &&
      length > 0 &&
      length <= maximum
        ? length
        : undefined;
    let size = 0;
    try {
      onProgress?.(0, total);
      for (;;) {
        const result = await reader.read();
        if (result.done) break;
        size += result.value.length;
        if (size > maximum) throw new Error('Hub 响应超过大小限制');
        chunks.push(result.value);
        onProgress?.(size, total !== undefined && size <= total ? total : undefined);
      }
      return Buffer.concat(chunks);
    } finally {
      await reader.cancel();
      reader.releaseLock();
    }
  }
}

/** 剔除控制字符与格式字符后再写入终端，避免 Hub 返回内容伪造颜色或改写已打印的行。 */
export function terminalText(value: string): string {
  return value.replace(/[\p{Cc}\p{Cf}]/gu, ' ');
}

export function httpOrigin(value?: string): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.origin.length > 500) return undefined;
    return url.origin;
  } catch {
    return undefined;
  }
}

function safeRequestId(value: unknown, credential?: string): string | undefined {
  if (
    typeof value === 'string' &&
    /^[A-Za-z0-9_-]{1,80}$/.test(value) &&
    redactCredentials(value, credential) === value
  ) {
    return value;
  }
  return undefined;
}

export function responseRequestId(
  response: Response,
  payloadId?: unknown,
  credential?: string,
): string | undefined {
  return (
    safeRequestId(response.headers.get('X-Request-Id'), credential) ??
    safeRequestId(payloadId, credential)
  );
}

export function redactCredentials(value: string, credential?: string): string {
  const text = credential ? value.replaceAll(credential, '[已隐藏]') : value;
  const safe = terminalText(text)
    .replace(/\bBearer[ \t]+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [已隐藏]')
    .replace(/(\b(?:https?|ftp):\/\/)[^\s/@]+@/gi, '$1')
    .replace(/(?<![A-Za-z0-9_-])[A-Za-z0-9_-]{43}(?![A-Za-z0-9_-])/g, '[已隐藏]');
  return secretFindings(safe).next().done ? safe : '[已隐藏凭据信息]';
}
