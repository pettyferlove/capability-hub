import { fail } from '@capability-hub/domain/errors';
import type { Express } from 'express';
import { CLIENT_INFO_META_KEY } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { createMcp } from '../../integrations/mcp.js';
import { publishedHubClientSkillUrl } from '../../integrations/hub-client-skill.js';
import type { HttpContext } from '../context.js';

const bridge = z.object({ name: z.literal('capability-hub-bridge'), version: z.string() });
const bridgeHandshake = z.union([
  z
    .object({ method: z.literal('initialize'), params: z.object({ clientInfo: bridge }) })
    .transform(({ params }) => params.clientInfo.version),
  z
    .object({
      method: z.literal('server/discover'),
      params: z.object({ _meta: z.object({ [CLIENT_INFO_META_KEY]: bridge }) }),
    })
    .transform(({ params }) => params._meta[CLIENT_INFO_META_KEY].version),
]);

/**
 * Hub 的 MCP 端点接受 OAuth 连接凭据或有效的个人访问令牌，缺少 Authorization 返回 401。
 * 令牌作用域即工具边界，`hub:read` 只读、`hub:contribute` 才能贡献，工具内仍按当前 principal 复核。
 * 连接断开时关闭该次请求的 MCP handler，避免长连接持有会话。
 */
export function registerMcpRoutes(app: Express, { hub }: HttpContext): void {
  app.all('/mcp', async (req, res, next) => {
    try {
      const { principal, token, credential, request_id } = res.locals;
      if (!token || !credential) fail(401, 'BEARER_REQUIRED', '请在客户端发起 Hub 连接授权');
      const request: unknown = req.body;
      const method =
        request && typeof request === 'object' && 'method' in request ? request.method : undefined;
      const handshake =
        method === 'initialize' || method === 'server/discover'
          ? {
              publishedSkillUrl: await publishedHubClientSkillUrl(hub),
              bridgeVersion: bridgeHandshake.safeParse(request).data,
            }
          : undefined;
      const m = createMcp(hub, principal, token.scope, credential, request_id, handshake);
      res.on('close', () => void m.handler.close());
      await m.node(req, res, req.body);
    } catch (e) {
      next(e);
    }
  });
}
