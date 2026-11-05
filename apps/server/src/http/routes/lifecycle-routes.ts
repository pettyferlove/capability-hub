import type { Express } from 'express';
import { z } from 'zod';
import type { HttpContext } from '../context.js';
import { idempotencyKey as key, jsonRoute as send } from '../response.js';

/**
 * 资产/版本删除、`usage`、`lifecycle` 和 `migrate-source` 校验资产修订号 `If-Match`：
 * 缺失 428 `IF_MATCH_REQUIRED`、不符 412 `REVISION_CONFLICT`；`revoke` 和
 * `rollback-requests` 不校验此请求头。删除及 `rollback-requests` 另需 `Idempotency-Key`，
 * 权限与事务由服务层处理。
 */
export function registerLifecycleRoutes(app: Express, { hub }: HttpContext): void {
  app.delete(
    '/api/assets/:id',
    send(
      async (req, res) =>
        await hub.lifecycle.deleteAsset(
          res.locals.principal,
          z.uuid().parse(req.params.id),
          req.body,
          req.get('If-Match'),
          key(req),
        ),
    ),
  );
  app.patch(
    '/api/assets/:id/usage',
    send(
      async (req, res) =>
        await hub.lifecycle.updateUsage(
          res.locals.principal,
          String(req.params.id),
          req.body,
          req.get('If-Match'),
        ),
    ),
  );
  app.delete(
    '/api/versions/:id',
    send(async (req, res) =>
      hub.lifecycle.deleteVersion(
        res.locals.principal,
        z.uuid().parse(req.params.id),
        req.body,
        req.get('If-Match'),
        key(req),
      ),
    ),
  );
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
