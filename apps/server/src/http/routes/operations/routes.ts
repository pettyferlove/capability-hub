import {
  agentExecutionLedgerQuerySchema,
  auditLogQuerySchema,
  operationsAgentApi,
  resourceActivityQuerySchema,
  tokenUsageQuerySchema,
} from '@capability-hub/contracts';
import type { Express } from 'express';
import { resourceActivity } from '../../../operations/resource-activity.js';
import { operationsSnapshot } from '../../../operations/snapshot.js';
import { tokenUsage } from '../../../operations/token-usage.js';
import type { HttpContext } from '../../context.js';
import { jsonRoute as send } from '../../response.js';
import { decodeCursor } from '../ai-execution-page.js';
import { executionLedgerPage } from './execution-ledger.js';
import { registerExecutionDiagnosticsRoute } from './execution-diagnostics.js';

/** 运营汇总需要平台审计权限；跨用户执行检查独立校验平台检查权与任务资源。 */
export function registerOperationsRoutes(
  app: Express,
  { hub, metrics, worker, security }: HttpContext,
): void {
  const { identity } = hub;
  app.use(operationsAgentApi.root, security.requireWebSession);
  app.get(
    operationsAgentApi.catalog,
    send((_req, res) => {
      res.set('Cache-Control', 'private, no-store');
      return hub.ai.catalog(res.locals.principal);
    }),
  );
  app.get(
    operationsAgentApi.executions,
    send(async (req, res) => {
      const principal = await hub.ai.consolePrincipal(res.locals.principal);
      const query = agentExecutionLedgerQuerySchema.parse(req.query);
      res.set('Cache-Control', 'private, no-store');
      return await executionLedgerPage(hub, principal, query, decodeCursor(query.cursor));
    }),
  );
  registerExecutionDiagnosticsRoute(app, hub);
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
