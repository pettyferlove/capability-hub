import type { Express } from 'express';
import { z } from 'zod';
import type { HttpContext } from '../context.js';
import { idempotencyKey as key, jsonRoute as send } from '../response.js';

/**
 * 资产生命周期。写操作全部透传 `If-Match`：缺失 428 `IF_MATCH_REQUIRED`、不符 412
 * `REVISION_CONFLICT`；`rollback-requests` 另带 `Idempotency-Key`，避免重复发起回滚。
 * 权限在服务层判定：`usage`/`lifecycle` 需要 `asset:lifecycle` 或维护权，`revoke` 需要
 * `version:revoke` 并要求 1–2000 字原因（写入审计），`migrate-source` 需要 `asset:migrate`
 * 且源与目标都要 `source:share`。`mcp-options` 只返回调用者可读版本的可安装项。
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
