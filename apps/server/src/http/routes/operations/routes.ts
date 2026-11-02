import {
  auditLogQuerySchema,
  resourceActivityQuerySchema,
  tokenUsageQuerySchema,
} from '@capability-hub/contracts';
import type { Express } from 'express';
import { resourceActivity } from '../../../operations/resource-activity.js';
import { operationsSnapshot } from '../../../operations/snapshot.js';
import { tokenUsage } from '../../../operations/token-usage.js';
import type { HttpContext } from '../../context.js';
import { jsonRoute as send } from '../../response.js';

/** 运营汇总要求平台审计权限，审计明细由用例按当前身份裁剪。 */
export function registerOperationsRoutes(
  app: Express,
  { hub, metrics, worker }: HttpContext,
): void {
  const { identity } = hub;
  app.get(
    '/api/admin/resource-activity',
    send(async (req, res) => {
      identity.require(res.locals.principal, 'audit:read');
      const { days } = resourceActivityQuerySchema.parse(req.query);
      res.set('Cache-Control', 'private, no-store');
      return await resourceActivity(hub.store, days);
    }),
  );
  app.get(
    '/api/admin/token-usage',
    send(async (req, res) => {
      identity.require(res.locals.principal, 'audit:read');
      const { period } = tokenUsageQuerySchema.parse(req.query);
      res.set('Cache-Control', 'private, no-store');
      return await tokenUsage(hub, period);
    }),
  );
  app.get(
    '/api/admin/operations',
    send(async (_req, res) => {
      identity.require(res.locals.principal, 'audit:read');
      return await operationsSnapshot(hub, metrics, worker);
    }),
  );
  app.get(
    '/api/admin/audit',
    send(
      async (req, res) =>
        await hub.audit.list(res.locals.principal, auditLogQuerySchema.parse(req.query)),
    ),
  );
}
