import type { Express } from 'express';
import type { HttpContext } from '../context.js';
import { jsonRoute } from '../response.js';

/**
 * 个人视图：`/api/me/*` 只操作 `res.locals.principal` 自身，会话列表额外传当前会话 id 以便
 * 区分「本次登录」；`PATCH /api/me/profile` 用 `If-Match` 做乐观并发（缺失 428、不符 412），
 * git 凭据的 `PUT`/`DELETE` 同样比对 `revision`，但缺失与不符都按 412 `REVISION_CONFLICT` 处理，
 * 且只能操作自己名下的凭据。
 */
export function registerProfileRoutes(app: Express, { hub }: HttpContext): void {
  app.get(
    '/api/me/profile',
    jsonRoute(async (_req, res) => await hub.profile.detail(res.locals.principal)),
  );
  app.patch(
    '/api/me/profile',
    jsonRoute(
      async (req, res) =>
        await hub.profile.update(res.locals.principal, req.body, req.get('If-Match')),
    ),
  );
  app.get(
    '/api/me/activity',
    jsonRoute(async (_req, res) => await hub.profile.activity(res.locals.principal.id)),
  );
  app.get(
    '/api/me/sessions',
    jsonRoute(
      async (_req, res) => await hub.sessions.list(res.locals.principal.id, res.locals.session!.id),
    ),
  );
  app.delete(
    '/api/me/sessions/:id',
    jsonRoute(async (req, res) => {
      await hub.sessions.revoke(
        res.locals.principal.id,
        String(req.params.id),
        res.locals.session!.id,
      );
      return { ok: true };
    }),
  );
  app.get(
    '/api/git-credentials',
    jsonRoute(async (_req, res) => await hub.credentials.list(res.locals.principal)),
  );
  app.post(
    '/api/git-credentials',
    jsonRoute(async (req, res) => await hub.credentials.save(res.locals.principal, req.body)),
  );
  app.put(
    '/api/git-credentials/:id',
    jsonRoute(
      async (req, res) =>
        await hub.credentials.save(
          res.locals.principal,
          req.body,
          String(req.params.id),
          req.get('If-Match'),
        ),
    ),
  );
  app.delete(
    '/api/git-credentials/:id',
    jsonRoute(
      async (req, res) =>
        await hub.credentials.revoke(
          res.locals.principal,
          String(req.params.id),
          req.get('If-Match'),
        ),
    ),
  );
}
