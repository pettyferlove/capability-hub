import type { Express } from 'express';
import type { HttpContext } from '../context.js';
import { idempotencyKey, jsonRoute as send, withRevision } from '../response.js';

/**
 * 账号、角色、授权与场景管理。整组挂在 `/api` 前缀下，先经 `security.authenticate` 要求会话或 Bearer，写操作再过 CSRF；
 * 管理权限由服务层按当前身份逐次校验。
 * `PATCH` 把 `If-Match` 修订号交给 `matchRevision`：缺失 → 428 `IF_MATCH_REQUIRED`，
 * 不符 → 412 `REVISION_CONFLICT`；其余失败以 `HubError` 抛给统一错误处理器映射状态码。
 */
export function registerIdentityRoutes(app: Express, { hub }: HttpContext): void {
  const { administration } = hub;
  app.get(
    '/api/admin/identity',
    send(async (_req, res) => await administration.adminSnapshot(res.locals.principal)),
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
  app.post(
    '/api/admin/scenarios',
    send(async (req, res) => administration.createScenario(res.locals.principal, req.body)),
  );
  app.get(
    '/api/admin/scenarios',
    send(async (_req, res) => administration.listScenarios(res.locals.principal)),
  );
  app.patch(
    '/api/admin/scenarios/:id',
    send(async (req, res) =>
      withRevision(
        res,
        await administration.updateScenario(
          res.locals.principal,
          String(req.params.id),
          req.body,
          req.get('If-Match'),
          idempotencyKey(req),
        ),
      ),
    ),
  );
}
