import { createSourceRequestSchema, updateSourceRequestSchema } from '@capability-hub/contracts';
import type { Express } from 'express';
import type { HttpContext } from '../context.js';
import { withRevision as etag, idempotencyKey as key, jsonRoute as send } from '../response.js';
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
