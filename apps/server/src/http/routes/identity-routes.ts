import { auditLogQuerySchema } from '@capability-hub/contracts';
import type { Express } from 'express';
import { operations } from '../../observability/operations.js';
import type { HttpContext } from '../context.js';
import { jsonRoute as send } from '../response.js';

/**
 * 管理面。整组挂在 `/api` 前缀下，先经 `security.authenticate` 要求会话或 Bearer，写操作再过 CSRF；
 * 组内权限由服务层按 `principal` 逐次校验：`/api/admin/operations` 需要 `audit:read`，
 * `administration` 的变更需要 `identity:manage`，审计读取另按 `audit:read` 收敛可见范围。
 * `PATCH` 把 `If-Match` 修订号交给 `matchRevision`：缺失 → 428 `IF_MATCH_REQUIRED`，
 * 不符 → 412 `REVISION_CONFLICT`；其余失败以 `HubError` 抛给统一错误处理器映射状态码。
 */
export function registerIdentityRoutes(app: Express, { hub, metrics, worker }: HttpContext): void {
  const { identity, administration } = hub;
  app.get(
    '/api/admin/identity',
    send(async (_req, res) => await administration.adminSnapshot(res.locals.principal)),
  );
  app.get(
    '/api/admin/operations',
    send(async (_req, res) => {
      identity.require(res.locals.principal, 'audit:read');
      return await operations(hub, metrics, worker);
    }),
  );
  app.post(
    '/api/admin/users',
    send(async (req, res) => await administration.createUser(res.locals.principal, req.body)),
  );
  app.patch(
    '/api/admin/users/:id',
    send(
      async (req, res) =>
        await administration.updateUser(
          res.locals.principal,
          String(req.params.id),
          req.body,
          req.get('If-Match'),
        ),
    ),
  );
  app.post(
    '/api/admin/groups',
    send(async (req, res) => await administration.createGroup(res.locals.principal, req.body)),
  );
  app.post(
    '/api/admin/roles',
    send(async (req, res) => await administration.createRole(res.locals.principal, req.body)),
  );
  app.post(
    '/api/admin/bindings',
    send(async (req, res) => await administration.grantRole(res.locals.principal, req.body)),
  );
  app.post(
    '/api/admin/memberships',
    send(async (req, res) => await administration.addMembership(res.locals.principal, req.body)),
  );
  for (const [path, table] of [
    ['bindings', 'role_bindings'],
    ['memberships', 'memberships'],
  ] as const)
    app.delete(
      '/api/admin/' + path + '/:id',
      send(
        async (req, res) =>
          await administration.removeGrant(res.locals.principal, table, String(req.params.id)),
      ),
    );
  app.patch(
    '/api/admin/roles/:id',
    send(
      async (req, res) =>
        await administration.updateRole(
          res.locals.principal,
          String(req.params.id),
          req.body,
          req.get('If-Match'),
        ),
    ),
  );
  app.patch(
    '/api/admin/groups/:id',
    send(
      async (req, res) =>
        await administration.updateGroup(
          res.locals.principal,
          String(req.params.id),
          req.body,
          req.get('If-Match'),
        ),
    ),
  );
  app.get(
    '/api/admin/audit',
    send(
      async (req, res) =>
        await hub.audit.list(res.locals.principal, auditLogQuerySchema.parse(req.query)),
    ),
  );
  app.post(
    '/api/admin/scenarios',
    send(async (req, res) => administration.createScenario(res.locals.principal, req.body)),
  );
}
