import { fail } from '@capability-hub/domain/errors';
import type { Express } from 'express';
import { createMcp } from '../../integrations/mcp.js';
import type { HttpContext } from '../context.js';

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
