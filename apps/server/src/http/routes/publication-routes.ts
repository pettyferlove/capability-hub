import {
  nominateAssetRequestSchema,
  submitPublicationRequestSchema,
  publicationDecisionRequestSchema,
} from '@capability-hub/contracts';
import type { Express } from 'express';
import { z } from 'zod';
import type { HttpContext } from '../context.js';
import { withRevision as etag, idempotencyKey as key, jsonRoute as send } from '../response.js';
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
