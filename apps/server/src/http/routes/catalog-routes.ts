import {
  assetFeedbackRequestSchema,
  assetFeedbackUpdateRequestSchema,
  assetFeedbackQuerySchema,
  catalogSearchQuerySchema,
  keywordSuggestionsQuerySchema,
  assetRecommendationRequestSchema,
} from '@capability-hub/contracts';
import type { Express } from 'express';
import { z } from 'zod';
import { createClientConfiguration } from '../../integrations/client-config.js';
import type { HttpContext } from '../context.js';
import { withRevision as etag, jsonRoute as send } from '../response.js';
/** 读取入口解析可选身份，应用服务核对发布受众。 */
export function registerCatalogRoutes(app: Express, { hub, security }: HttpContext): void {
  const read = security.optionalAuthenticate;
  app.get(
    '/api/assets/keywords',
    read,
    send(
      async (req, res) =>
        await hub.catalog.suggestKeywords(
          res.locals.viewer ?? null,
          keywordSuggestionsQuerySchema.parse(req.query),
        ),
    ),
  );
  app.get(
    '/api/scenarios',
    read,
    send(async (_req, res) => await hub.catalog.listScenarios(res.locals.viewer ?? null)),
  );
  app.get(
    '/api/assets',
    read,
    send(
      async (req, res) =>
        await hub.catalog.search(
          res.locals.viewer ?? null,
          catalogSearchQuerySchema.parse(req.query),
        ),
    ),
  );
  app.get(
    '/api/assets/:id',
    read,
    send(async (req, res) =>
      etag(res, await hub.catalog.getDetail(res.locals.viewer ?? null, String(req.params.id))),
    ),
  );
  app.get(
    '/api/assets/:id/versions',
    read,
    send(
      async (req, res) =>
        await hub.catalog.listHistory(res.locals.viewer ?? null, String(req.params.id)),
    ),
  );
  app.get(
    '/api/versions/:id/manifest',
    read,
    send(
      async (req, res) =>
        await hub.content.getManifest(res.locals.viewer ?? null, String(req.params.id)),
    ),
  );
  app.get(
    '/api/versions/:id/files',
    read,
    send(async (req, res) => {
      const path = z.string().parse(req.query.path);
      const f = await hub.content.getFile(res.locals.viewer ?? null, String(req.params.id), path);
      res.set('Content-Type', 'application/octet-stream');
      res.set(
        'Content-Disposition',
        `attachment; filename*=UTF-8''${encodeURIComponent(path.split('/').pop()!)}`,
      );
      res.send(f.bytes);
    }),
  );
  app.get(
    '/api/versions/:id/archive',
    read,
    send(async (req, res) => {
      const archive = await hub.content.getArchive(
        res.locals.viewer ?? null,
        String(req.params.id),
      );
      res.set({
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${archive.slug}.zip"`,
        'X-Content-SHA256': archive.artifact_digest,
      });
      res.send(archive.bytes);
    }),
  );
  app.get(
    '/api/versions/:id/mcp-config',
    read,
    send(
      async (req, res) =>
        await createClientConfiguration(hub, res.locals.viewer ?? null, {
          ...req.query,
          version_id: String(req.params.id),
        }),
    ),
  );
}
/** 管理入口要求身份；浏览器会话的写入继续校验 CSRF。 */
export function registerProtectedCatalogRoutes(app: Express, { hub }: HttpContext): void {
  app.post(
    '/api/feedback',
    send(
      async (req, res) =>
        await hub.feedback.report(res.locals.principal, assetFeedbackRequestSchema.parse(req.body)),
    ),
  );
  app.get(
    '/api/feedback/:id',
    send(
      async (req, res) =>
        await hub.feedback.get(res.locals.principal, z.string().uuid().parse(req.params.id)),
    ),
  );
  app.get(
    '/api/assets/:id/feedback',
    send(
      async (req, res) =>
        await hub.feedback.list(
          res.locals.principal,
          String(req.params.id),
          assetFeedbackQuerySchema.parse(req.query),
        ),
    ),
  );
  app.patch(
    '/api/feedback/:id',
    send(
      async (req, res) =>
        await hub.feedback.update(
          res.locals.principal,
          z.string().uuid().parse(req.params.id),
          assetFeedbackUpdateRequestSchema.parse(req.body),
        ),
    ),
  );
  app.post(
    '/api/ratings',
    send(
      async (req, res) =>
        await hub.community.rate(
          res.locals.principal,
          assetRecommendationRequestSchema.parse(req.body),
        ),
    ),
  );
  app.get(
    '/api/management/versions/:id/manifest',
    send(
      async (req, res) =>
        await hub.content.getManifest(res.locals.principal, String(req.params.id), true),
    ),
  );
  app.get(
    '/api/management/versions/:id/files',
    send(async (req, res) => {
      const path = z.string().parse(req.query.path);
      const file = await hub.content.getFile(
        res.locals.principal,
        String(req.params.id),
        path,
        true,
      );
      res.set({
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(path.split('/').pop()!)}`,
      });
      res.send(file.bytes);
    }),
  );
  app.post(
    '/api/mcp-config',
    send(async (req, res) => await createClientConfiguration(hub, res.locals.principal, req.body)),
  );
}
