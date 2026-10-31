import {
  uploadIntakeRequestSchema,
  intakeListQuerySchema,
  keywordOptionsQuerySchema,
} from '@capability-hub/contracts';
import { boundedJson } from '@capability-hub/infrastructure/content';
import { fail } from '@capability-hub/domain/errors';
import type { Express } from 'express';
import multer from 'multer';
import { z } from 'zod';
import type { HttpContext } from '../context.js';
import { idempotencyKey as key, jsonRoute as send } from '../response.js';
import { streamIntakeProgress } from './intake-events.js';
export function registerIntakesRoutes(app: Express, context: HttpContext): void {
  const { hub } = context;
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024, files: 1, fields: 1, fieldSize: 16384, parts: 2 },
  });
  app.post(
    '/api/intakes',
    upload.single('file'),
    send(async (req, res) => {
      if (!req.file) fail(422, 'FILE_REQUIRED', '请选择文件');
      const form = z
        .object({ metadata: z.string().max(16384) })
        .strict()
        .parse(req.body);
      const metadata = uploadIntakeRequestSchema.parse(boundedJson(form.metadata));
      res.status(202);
      return await hub.intakes.receive(
        res.locals.principal,
        req.file.buffer,
        req.file.originalname,
        metadata,
        key(req),
      );
    }),
  );
  app.get(
    '/api/intakes',
    send(
      async (req, res) =>
        await hub.intakeQueries.list(res.locals.principal, intakeListQuerySchema.parse(req.query)),
    ),
  );
  app.get(
    '/api/management/keywords',
    send(async (req, res) =>
      hub.assetManagement.keywordOptions(
        res.locals.principal,
        keywordOptionsQuerySchema.parse(req.query),
      ),
    ),
  );
  app.get(
    '/api/management/assets',
    send(async (_req, res) => hub.assetManagement.list(res.locals.principal)),
  );
  app.get(
    '/api/management/assets/:id/version-plan',
    send(
      async (req, res) =>
        await hub.intakeQueries.versionPlan(res.locals.principal, String(req.params.id)),
    ),
  );
  app.get(
    '/api/management/assets/:id/versions',
    send(async (req, res) =>
      hub.assetManagement.versions(res.locals.principal, String(req.params.id)),
    ),
  );
  app.get(
    '/api/intakes/:id/events',
    send(async (req, res) => streamIntakeProgress(req, res, context)),
  );
  app.get(
    '/api/intakes/:id',
    send(
      async (req, res) =>
        await hub.intakeQueries.getDetail(res.locals.principal, String(req.params.id)),
    ),
  );
  app.post(
    '/api/intakes/:id/retry',
    send(async (req, res) => {
      return await hub.intakes.retry(res.locals.principal, String(req.params.id));
    }),
  );
  app.post(
    '/api/intakes/:id/rescan',
    send(async (req, res) => {
      res.status(202);
      return await hub.intakes.rescan(res.locals.principal, String(req.params.id), key(req));
    }),
  );
  app.get(
    '/api/management/versions/:id',
    send(async (req, res) =>
      hub.assetManagement.versionDetails(res.locals.principal, String(req.params.id)),
    ),
  );
}
