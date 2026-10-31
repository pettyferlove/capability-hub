import { issueTokenRequestSchema, approveCliLoginRequestSchema } from '@capability-hub/contracts';
import type { Express } from 'express';
import { changePasswordRequestSchema } from '@capability-hub/contracts';
import type { HttpContext } from '../context.js';
import { jsonRoute } from '../response.js';

export function registerSessionRoutes(app: Express, { hub }: HttpContext): void {
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
      res.clearCookie('hub_session', { path: '/' });
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
      res.clearCookie('hub_session', { path: '/' });
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
