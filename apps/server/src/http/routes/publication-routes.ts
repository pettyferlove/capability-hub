import {
  nominateAssetRequestSchema,
  submitPublicationRequestSchema,
  publicationDecisionRequestSchema,
} from '@capability-hub/contracts';
import type { Express } from 'express';
import { z } from 'zod';
import type { HttpContext } from '../context.js';
import { withRevision as etag, idempotencyKey as key, jsonRoute as send } from '../response.js';

/**
 * 共享申请与审核。`nominate`/`submit`/`decide` 都读 `Idempotency-Key`，重复提交返回首次结果；
 * `decide` 与 `cancel` 用 `If-Match` 比对 `revision`（缺失 428、不符 412），
 * 且审核者不能审自己的申请
 * （403 `SELF_REVIEW`）；`GET :id` 返回评审视图时带 `ETag` 供调用方回填 `If-Match`。
 * 列表默认只看 `pending`，可见范围由服务层按 `principal` 的审核范围过滤。
 */
export function registerPublicationRoutes(app: Express, { hub }: HttpContext): void {
  app.post(
    '/api/nominations',
    send(async (req, res) => {
      res.status(201);
      return await hub.publications.nominate(
        res.locals.principal,
        nominateAssetRequestSchema.parse(req.body),
        key(req),
      );
    }),
  );
  app.post(
    '/api/publication-requests',
    send(async (req, res) => {
      res.status(201);
      return await hub.publications.submit(
        res.locals.principal,
        submitPublicationRequestSchema.parse(req.body),
        key(req),
      );
    }),
  );
  app.get(
    '/api/publication-requests',
    send(async (req, res) => ({
      items: await hub.publicationQueries.listRequests(
        res.locals.principal,
        z
          .enum(['pending', 'approved', 'rejected', 'cancelled', 'stale'])
          .default('pending')
          .parse(req.query.state),
      ),
    })),
  );
  app.get(
    '/api/publication-requests/:id',
    send(async (req, res) => {
      return etag(
        res,
        await hub.publicationQueries.getReview(res.locals.principal, String(req.params.id)),
      );
    }),
  );
  app.post(
    '/api/publication-requests/:id/decision',
    send(async (req, res) =>
      etag(
        res,
        await hub.publications.decide(
          res.locals.principal,
          String(req.params.id),
          publicationDecisionRequestSchema.parse(req.body),
          req.get('If-Match'),
          key(req),
        ),
      ),
    ),
  );
  app.post(
    '/api/publication-requests/:id/cancel',
    send(
      async (req, res) =>
        await hub.publications.cancel(
          res.locals.principal,
          String(req.params.id),
          req.body,
          req.get('If-Match'),
        ),
    ),
  );
}
