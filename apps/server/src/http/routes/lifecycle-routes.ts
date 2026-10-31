import type { Express } from 'express';
import { z } from 'zod';
import type { HttpContext } from '../context.js';
import { idempotencyKey as key, jsonRoute as send } from '../response.js';
export function registerLifecycleRoutes(app: Express, { hub }: HttpContext): void {
  app.patch(
    '/api/assets/:id/lifecycle',
    send(
      async (req, res) =>
        await hub.lifecycle.updateState(
          res.locals.principal,
          String(req.params.id),
          req.body,
          req.get('If-Match'),
        ),
    ),
  );
  app.post(
    '/api/versions/:id/revoke',
    send(
      async (req, res) =>
        await hub.lifecycle.revokeVersion(
          res.locals.principal,
          String(req.params.id),
          z
            .object({ reason: z.string().trim().min(1).max(2000) })
            .strict()
            .parse(req.body).reason,
        ),
    ),
  );
  app.post(
    '/api/assets/:id/migrate-source',
    send(
      async (req, res) =>
        await hub.lifecycle.migrateSource(
          res.locals.principal,
          String(req.params.id),
          req.body,
          req.get('If-Match'),
        ),
    ),
  );
  app.get(
    '/api/versions/:id/mcp-options',
    send(
      async (req, res) =>
        await hub.content.getMcpOptions(res.locals.principal, String(req.params.id)),
    ),
  );
  app.post(
    '/api/assets/:id/rollback-requests',
    send(
      async (req, res) =>
        await hub.lifecycle.requestRollback(
          res.locals.principal,
          String(req.params.id),
          req.body,
          key(req),
        ),
    ),
  );
}
