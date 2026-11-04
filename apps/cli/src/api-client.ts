import type { z } from 'zod';
import { boundedJson } from '@capability-hub/infrastructure/content/json';

/**
 * Hub 返回非 2xx 时抛出的错误：`status` 是 HTTP 状态码，`code` 是 Hub 错误码，
 * 调用方应按 `code` 分支（例如 `invalid_grant` 提示重新授权），不要解析拼接后的 `message`。
 */
export class HubApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(`${code}: ${message}`);
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
 * CLI 侧最小的 Hub 客户端：不跟随重定向（`redirect: 'error'`），每次请求 30 秒超时，
 * 非 2xx 一律转成 {@link HubApiError}，错误体按固定上限读取并清洗控制字符后才写入终端，
 * 因此 Hub 返回的文本无法向用户终端注入转义序列。
 * 响应体同样有上限：JSON 1 MiB、归档 120 MiB，超出即中止读取。
 */
export class HubApiClient {
  constructor(
    readonly url: string,
    private readonly token?: string,
  ) {}

  async request(path: string, body?: unknown): Promise<Response> {
    const response = await fetch(this.url + path, {
      method: body === undefined ? 'GET' : 'POST',
      redirect: 'error',
      headers: {
        ...(this.token ? { Authorization: 'Bearer ' + this.token } : {}),
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) {
      let detail: unknown;
      try {
        detail = boundedJson((await this.readBytes(response, 1024 * 1024)).toString());
      } catch {
        /* 非 JSON 错误只报告 HTTP 状态，不打印未校验的响应体。 */
      }
      const error =
        detail && typeof detail === 'object' && 'error' in detail ? detail.error : undefined;
      if (typeof error === 'string') {
        const code = Object.hasOwn(oauthMessages, error) ? error : 'OAUTH_ERROR';
        throw new HubApiError(
          response.status,
          code,
          oauthMessages[code] ?? '授权失败，请检查连接状态后重试',
        );
      }
      const code =
        error &&
        typeof error === 'object' &&
        'code' in error &&
        typeof error.code === 'string' &&
        /^[A-Z0-9_]{1,80}$/.test(error.code)
          ? error.code
          : String(response.status);
      const message =
        error &&
        typeof error === 'object' &&
        'message' in error &&
        typeof error.message === 'string'
          ? terminalText(error.message).slice(0, 500)
          : '请求失败';
      throw new HubApiError(response.status, code, message);
    }
    return response;
  }

  async json<T>(path: string, schema: z.ZodType<T>, body?: unknown): Promise<T> {
    const response = await this.request(path, body);
    const parsed = schema.safeParse(
      boundedJson((await this.readBytes(response, 1024 * 1024)).toString()),
    );
    if (!parsed.success) throw new Error('Hub 响应结构无效');
    return parsed.data;
  }

  async archive(path: string): Promise<Buffer> {
    return this.readBytes(await this.request(path), 120 * 1024 * 1024);
  }

  private async readBytes(response: Response, maximum: number): Promise<Buffer> {
    if (!response.body) throw new Error('Hub 返回了空响应');
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const result = await reader.read();
        if (result.done) break;
        size += result.value.length;
        if (size > maximum) throw new Error('Hub 响应超过大小限制');
        chunks.push(result.value);
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
