import { createSourceRequestSchema, updateSourceRequestSchema } from '@capability-hub/contracts';
import type { Express } from 'express';
import type { HttpContext } from '../context.js';
import { withRevision as etag, idempotencyKey as key, jsonRoute as send } from '../response.js';

/**
 * Git 来源管理。`POST /api/sources`、`sync` 读 `Idempotency-Key` 以免重复建源或重复触发同步，
 * `sync` 只入队并返回 202，进度用 `GET :id/sync-jobs/:job` 轮询；`PATCH` 与 `revoke-distribution`
 * 用 `If-Match` 做并发校验（缺失 428、不符 412）。权限在服务层判定：建源需要 `source:create`，
 * 变更与共享撤销需要来源维护权与 `source:share`，越权与不可见都以 `HubError` 抛出。
 */
export function registerSourcesRoutes(app: Express, { sources }: HttpContext): void {
  app.get(
    '/api/sources',
    send(async (_req, res) => await sources.list(res.locals.principal)),
  );
  app.get(
    '/api/sources/:id',
    send(async (req, res) =>
      etag(res, await sources.get(res.locals.principal, String(req.params.id))),
    ),
  );
  app.post(
    '/api/sources',
    send(async (req, res) => {
      res.status(201);
      const r = await sources.create(
        res.locals.principal,
        createSourceRequestSchema.parse(req.body),
        key(req),
      );
      return etag(res, r);
    }),
  );
  app.patch(
    '/api/sources/:id',
    send(async (req, res) =>
      etag(
        res,
        await sources.patch(
          res.locals.principal,
          String(req.params.id),
          updateSourceRequestSchema.parse(req.body),
          req.get('If-Match'),
        ),
      ),
    ),
  );
  app.post(
    '/api/sources/:id/sync',
    send(async (req, res) => {
      res.status(202);
      return await sources.sync(res.locals.principal, String(req.params.id), key(req));
    }),
  );
  app.get(
    '/api/sources/:id/sync-jobs/:job',
    send(
      async (req, res) =>
        await sources.getSyncJob(
          res.locals.principal,
          String(req.params.id),
          String(req.params.job),
        ),
    ),
  );
  app.post(
    '/api/sources/:id/revoke-distribution',
    send(
      async (req, res) =>
        await sources.revokeDistribution(
          res.locals.principal,
          String(req.params.id),
          req.body,
          req.get('If-Match'),
        ),
    ),
  );
}
