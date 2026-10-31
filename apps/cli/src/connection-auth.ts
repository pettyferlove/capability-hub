import { createHash, randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { z } from 'zod';
import { sha256 } from '@capability-hub/domain/canonical';
import { agentClients, type AgentClient } from '@capability-hub/contracts';
import { HubApiClient } from './api-client.js';
import { savePrivateJson, loadPrivateJson } from './private-json.js';
import { withFileLock } from './file-lock.js';

const tokens = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  token_type: z.literal('Bearer'),
  expires_in: z.number().int().positive(),
  scope: z.string(),
});
const credentials = z
  .object({
    url: z.string(),
    client_id: z.string(),
    access_token: z.string(),
    refresh_token: z.string(),
    expires_at: z.number(),
    scope: z.string(),
  })
  .strict();
export type ConnectionCredentials = z.infer<typeof credentials>;
export function connectionFile(directory: string, url: string, client: AgentClient) {
  return join(directory, 'connections', sha256(url + '\n' + client) + '.json');
}
export async function readConnection(path: string, url: string) {
  const saved = credentials.parse(await loadPrivateJson(path));
  if (saved.url !== url) throw new Error('连接凭据属于其他 Hub，请重新接入');
  return saved;
}
export async function authorizeConnection(
  url: string,
  client: AgentClient,
  contribute: boolean,
  noBrowser: boolean,
): Promise<ConnectionCredentials> {
  const api = new HubApiClient(url);
  const verifier = randomBytes(32).toString('base64url');
  const state = randomBytes(32).toString('base64url');
  let callback: (code: string) => void = () => {};
  let rejected: (error: Error) => void = () => {};
  let callbackUrl = '';
  const server = createServer((req, res) => {
    let target: URL;
    try {
      target = new URL(req.url ?? '/', callbackUrl);
    } catch {
      res.writeHead(400).end('Invalid callback URL');
      return;
    }
    if (
      req.method !== 'GET' ||
      target.origin !== new URL(callbackUrl).origin ||
      req.headers.host !== new URL(callbackUrl).host ||
      target.pathname !== '/callback'
    ) {
      res.writeHead(404).end();
      return;
    }
    if (
      ['state', 'iss'].some((key) => target.searchParams.getAll(key).length !== 1) ||
      ['code', 'error'].some((key) => target.searchParams.getAll(key).length > 1) ||
      target.searchParams.get('state') !== state ||
      target.searchParams.get('iss') !== url
    ) {
      res.writeHead(400).end('Invalid authorization response');
      return;
    }
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    const code = target.searchParams.get('code');
    if (!code || target.searchParams.has('error')) {
      res.end('已取消连接，可以关闭此页。');
      rejected(new Error('用户取消了连接授权'));
      return;
    }
    res.end('已收到授权，请返回终端查看连接结果。此页可以关闭。');
    callback(code);
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('无法启动本机授权回调');
  callbackUrl = `http://127.0.0.1:${address.port}/callback`;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const registered = await api.json('/oauth/register', z.object({ client_id: z.string() }), {
      client_name: agentClients[client].label + ' · 接入助手',
      redirect_uris: [callbackUrl],
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
    });
    const authorization = new URL(url + '/oauth/authorize');
    authorization.search = new URLSearchParams({
      client_id: registered.client_id,
      redirect_uri: callbackUrl,
      response_type: 'code',
      code_challenge_method: 'S256',
      code_challenge: createHash('sha256').update(verifier).digest('base64url'),
      state,
      resource: url + '/mcp',
      scope: contribute ? 'hub:read hub:contribute' : 'hub:read',
    }).toString();
    const code = await new Promise<string>((resolve, reject) => {
      callback = resolve;
      rejected = reject;
      timer = setTimeout(() => reject(new Error('授权等待超时，请重新运行 connect')), 600_000);
      process.stderr.write(
        `请在浏览器确认连接：\n${authorization.href}\n远程终端需要将本机回调端口 ${address.port} 转发到此环境。\n`,
      );
      if (!noBrowser) {
        const command =
          process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? null : 'xdg-open';
        if (command) {
          const child = spawn(command, [authorization.href], { stdio: 'ignore' });
          child.on('error', () => {
            process.stderr.write('无法自动打开浏览器，请打开上面的授权链接。\n');
          });
          child.unref();
        }
      }
    });
    const result = await api.json('/oauth/token', tokens, {
      grant_type: 'authorization_code',
      client_id: registered.client_id,
      code,
      redirect_uri: callbackUrl,
      code_verifier: verifier,
      resource: url + '/mcp',
    });
    return {
      url,
      client_id: registered.client_id,
      access_token: result.access_token,
      refresh_token: result.refresh_token,
      expires_at: Date.now() + result.expires_in * 1000,
      scope: result.scope,
    };
  } finally {
    if (timer) clearTimeout(timer);
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}
/** 同一凭据串行刷新；崩溃残留锁由心跳锁自动恢复。 */
export const withConnectionLock = withFileLock;
export class ConnectionChangedError extends Error {
  constructor() {
    super('连接身份或授权已更换，请在 Agent 中重新加载 Hub MCP');
  }
}
export async function connectionToken(
  path: string,
  url: string,
  clientId?: string,
): Promise<string> {
  const current = await readConnection(path, url);
  if (clientId && current.client_id !== clientId) throw new ConnectionChangedError();
  if (current.expires_at > Date.now() + 60_000) return current.access_token;
  return withConnectionLock(path, async () => {
    const saved = await readConnection(path, url);
    if (clientId && saved.client_id !== clientId) throw new ConnectionChangedError();
    if (saved.expires_at > Date.now() + 60_000) return saved.access_token;
    const result = await new HubApiClient(url).json('/oauth/token', tokens, {
      grant_type: 'refresh_token',
      client_id: saved.client_id,
      refresh_token: saved.refresh_token,
      resource: url + '/mcp',
    });
    await savePrivateJson(path, {
      ...saved,
      access_token: result.access_token,
      refresh_token: result.refresh_token,
      expires_at: Date.now() + result.expires_in * 1000,
      scope: result.scope,
    });
    return result.access_token;
  });
}
