import { issueTokenRequestSchema, approveCliLoginRequestSchema } from '@capability-hub/contracts';
import type { Express } from 'express';
import { changePasswordRequestSchema } from '@capability-hub/contracts';
import type { HttpContext } from '../context.js';
import { jsonRoute } from '../response.js';

/**
 * 会话与令牌自助。`/auth/logout` 在允许的匿名路径列表内，无会话时也清 cookie 并返回成功，
 * 因此可重复调用；修改密码成功后清掉当前 cookie，强制重新登录。令牌的列出/签发/撤销都只作用于
 * `res.locals.principal.id`，无法操作他人令牌；`/api/cli/approve` 需要登录态，
 * 把设备码批准绑定到当前用户。
 */
export function registerSessionRoutes(app: Express, { hub, security }: HttpContext): void {
  app.get(
    '/api/me',
    jsonRoute(
      async (_req, res) =>
        await hub.profile.current(res.locals.principal, res.locals.session?.csrf ?? ''),
    ),
  );
  app.post(
    '/auth/logout',
    jsonRoute(async (_req, res) => {
      const session = res.locals.session;
      if (session) await hub.sessions.logout(session.user_id, session.id);
      security.clearSessionCookie(res);
      return { ok: true };
    }),
  );
  app.post(
    '/api/password',
    jsonRoute(async (req, res) => {
      const input = changePasswordRequestSchema.parse(req.body);
      await hub.authentication.changePassword(
        res.locals.principal,
        input.current_password,
        input.new_password,
      );
      security.clearSessionCookie(res);
      return { ok: true };
    }),
  );
  app.get(
    '/api/tokens',
    jsonRoute(async (_req, res) => await hub.tokens.list(res.locals.principal.id)),
  );
  app.post(
    '/api/tokens',
    jsonRoute(
      async (req, res) =>
        await hub.tokens.issue(res.locals.principal, issueTokenRequestSchema.parse(req.body)),
    ),
  );
  app.delete(
    '/api/tokens/:id',
    jsonRoute(async (req, res) => {
      await hub.tokens.revoke(res.locals.principal.id, String(req.params.id));
      return { ok: true };
    }),
  );
  app.post(
    '/api/cli/approve',
    jsonRoute(async (req, res) => {
      await hub.cliLogin.approve(
        res.locals.principal,
        approveCliLoginRequestSchema.parse(req.body),
      );
      return { ok: true };
    }),
  );
}
