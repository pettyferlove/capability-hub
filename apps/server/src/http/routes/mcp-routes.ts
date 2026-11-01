import { fail } from '@capability-hub/domain/errors';
import type { Express } from 'express';
import { createMcp } from '../../integrations/mcp.js';
import type { HttpContext } from '../context.js';

/**
 * Hub 的 MCP 端点，只接受 OAuth 连接令牌：`security.authenticate` 对 `/mcp` 先拒绝缺失
 * Authorization（401 `BEARER_REQUIRED`），再拒绝把个人访问令牌用于该路径（403 `TOKEN_SCOPE`）。
 * 令牌作用域即工具边界，`hub:read` 只读、`hub:contribute` 才能贡献，工具内仍按当前 principal 复核。
 * 连接断开时关闭该次请求的 MCP handler，避免长连接持有会话。
 */
export function registerMcpRoutes(app: Express, { hub }: HttpContext): void {
  app.all('/mcp', async (req, res, next) => {
    try {
      if (!res.locals.token) fail(401, 'BEARER_REQUIRED', '请在客户端发起 Hub 连接授权');
      const m = createMcp(hub, res.locals.principal, res.locals.token.scope);
      res.on('close', () => void m.handler.close());
      await m.node(req, res, req.body);
    } catch (e) {
      next(e);
    }
  });
}
