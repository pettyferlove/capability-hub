import {
  evaluationResponseSchema,
  managementEvaluationsResponseSchema,
  requestEvaluationSchema,
  reviewEvaluationResponseSchema,
  requestEvaluationResponseSchema,
} from '@capability-hub/contracts';
import { fail } from '@capability-hub/domain/errors';
import type { Express } from 'express';
import { z } from 'zod';
import { evaluationIterationBundle } from '../../evaluation/iteration-bundle.js';
import type { HttpContext } from '../context.js';
import { idempotencyKey, jsonRoute } from '../response.js';

const iterationQuery = z.union([
  requestEvaluationSchema.pick({ publication_request_id: true }),
  z.strictObject({ view: z.literal('published') }),
]);

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
export function registerManagementEvaluationRoutes(app: Express, { hub, security }: HttpContext) {
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
    '/api/management/versions/:versionId/evaluations/:evaluationId/iteration.zip',
    jsonRoute(async (req, res) => {
      const query = iterationQuery.parse(req.query);
      const { slug, item } = await hub.evaluationQueries.iteration(
        async () => {
          const session = await security.session(req);
          if (!session || session.id !== res.locals.session?.id)
            fail(401, 'UNAUTHENTICATED', '会话已失效，请重新登录');
          return hub.identity.principal(session.user_id);
        },
        String(req.params.versionId),
        String(req.params.evaluationId),
        query,
      );
      const detail = managementEvaluationsResponseSchema.shape.items.element.parse(item);
      const bytes = await evaluationIterationBundle(slug, detail, req.signal);
      req.signal.throwIfAborted();
      res.attachment(`${slug}-iteration-${encodeURIComponent(detail.id)}.zip`);
      res.set({
        'Cache-Control': 'private, no-store',
        'Content-Type': 'application/zip',
        'Content-Length': String(bytes.length),
        'X-Content-Type-Options': 'nosniff',
      });
      res.end(bytes);
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
