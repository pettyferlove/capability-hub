import {
  evaluationResponseSchema,
  managementEvaluationsResponseSchema,
  requestEvaluationSchema,
  reviewEvaluationResponseSchema,
  requestEvaluationResponseSchema,
} from '@capability-hub/contracts';
import type { Express } from 'express';
import type { HttpContext } from '../context.js';
import { idempotencyKey, jsonRoute } from '../response.js';

/** 公开评测先解析可选身份，再按当前与历史发布受众授权。 */
export function registerEvaluationRoutes(app: Express, { hub, security }: HttpContext) {
  app.get(
    '/api/assets/:id/versions/:versionId/evaluation',
    security.optionalAuthenticate,
    jsonRoute(async (req, res) => {
      const result = await hub.evaluationQueries.published(
        res.locals.viewer ?? null,
        String(req.params.id),
        String(req.params.versionId),
        !!res.locals.session,
      );
      res.set('ETag', '"' + result.revisionKey + '"');
      return evaluationResponseSchema.parse(result.body);
    }),
  );
}

/** 此路由挂在认证中间件之后，证据访问由申请与资产范围限定。 */
export function registerManagementEvaluationRoutes(app: Express, { hub }: HttpContext) {
  app.get(
    '/api/publication-requests/:id/evaluation',
    jsonRoute(async (req, res) => {
      const result = await hub.evaluationQueries.review(
        res.locals.principal,
        String(req.params.id),
      );
      res.set('ETag', '"' + result.revisionKey + '"');
      return reviewEvaluationResponseSchema.parse(result.body);
    }),
  );
  app.post(
    '/api/management/versions/:versionId/evaluations',
    jsonRoute(async (req, res) => {
      const body = requestEvaluationSchema.parse(req.body === undefined ? {} : req.body);
      const result = await hub.evaluations.manual(
        res.locals.principal,
        String(req.params.versionId),
        idempotencyKey(req),
        body.publication_request_id,
      );
      res.status(result.reused ? 200 : 202);
      return requestEvaluationResponseSchema.parse(result);
    }),
  );
  app.get(
    '/api/management/versions/:versionId/evaluations',
    jsonRoute(async (req, res) => {
      const result = await hub.evaluationQueries.history(
        res.locals.principal,
        String(req.params.versionId),
      );
      res.set('ETag', '"' + result.revisionKey + '"');
      return managementEvaluationsResponseSchema.parse(result.body);
    }),
  );
}
