import { auditLogQuerySchema } from '@capability-hub/contracts';
import type { Express } from 'express';
import { operations } from '../../observability/operations.js';
import type { HttpContext } from '../context.js';
import { jsonRoute as send } from '../response.js';
export function registerIdentityRoutes(app: Express, { hub, metrics }: HttpContext): void {
  const { store, identity, administration, config } = hub;
  app.get(
    '/api/admin/identity',
    send(async (_req, res) => await administration.adminSnapshot(res.locals.principal)),
  );
  app.get(
    '/api/admin/operations',
    send(async (_req, res) => {
      identity.require(res.locals.principal, 'audit:read');
      return await operations(store, metrics, config.dataDir);
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
