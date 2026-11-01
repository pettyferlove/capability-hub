import { cliCredentialsSchema, type CliCredentials } from '@capability-hub/contracts';
import { savePrivateJson, loadPrivateJson } from './private-json.js';

/** 覆盖写入凭据文件前先按契约校验，非法值不会被持久化。 */
export async function saveCredentials(path: string, value: CliCredentials) {
  await savePrivateJson(path, parseCredentials(value));
}

export type { CliCredentials } from '@capability-hub/contracts';

/** 校验失败统一提示重新登录，避免把 zod 细节暴露给终端使用者。 */
export function parseCredentials(value: unknown): CliCredentials {
  const parsed = cliCredentialsSchema.safeParse(value);
  if (!parsed.success) throw new Error('凭据格式无效，请重新登录');
  return parsed.data;
}

/**
 * 归一化 Hub 地址为 origin。强制 HTTPS，只对 loopback（127.0.0.1/localhost/[::1]）放行明文 HTTP；
 * 带凭据、路径或查询的地址一律拒绝，保证后续凭据只会发往单一实例根地址。
 */
export function hubUrl(value: string) {
  if (/[\p{Cc}\p{Cf}\s]/u.test(value)) throw new Error('Hub URL 不能含空白或控制字符');
  const url = new URL(value);
  if (
    url.protocol !== 'https:' &&
    !(url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname))
  )
    throw new Error('Hub 地址必须为 HTTPS；仅 loopback 允许 HTTP');
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/')
    throw new Error('Hub URL 必须为实例根地址，不得带凭据、路径或查询');
  return url.origin;
}

/** 环境令牌与本地凭据只选择一种，避免把令牌发送到另一实例。 */
export async function resolveConsumerCredentials(options: {
  url?: string;
  environmentToken?: string;
  load: () => Promise<CliCredentials>;
}): Promise<CliCredentials> {
  if (options.environmentToken !== undefined) {
    const token = options.environmentToken;
    if (!token || /\s/.test(token))
      throw new Error('CAPABILITY_HUB_TOKEN 必须是非空且不含空白的个人访问令牌');
    if (!options.url) throw new Error('使用 CAPABILITY_HUB_TOKEN 必须同时提供 --url');
    return { url: hubUrl(options.url), token };
  }
  const saved = parseCredentials(await options.load());
  const url = hubUrl(saved.url);
  if (options.url !== undefined && hubUrl(options.url) !== url)
    throw new Error('--url 与已登录的 Hub 地址不一致，请使用对应 Hub 的个人访问令牌或重新登录');
  return { url, token: saved.token };
}

/** 读取 `--config-dir`（默认 `~/.config/capability-hub`）下的 `auth.json`，并同样做格式校验。 */
export async function loadCredentials(path: string): Promise<CliCredentials> {
  return parseCredentials(await loadPrivateJson(path));
}
