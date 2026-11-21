import {
  assetFeedbackRequestSchema,
  assetFeedbackUpdateRequestSchema,
  assetFeedbackQuerySchema,
  catalogSearchQuerySchema,
  keywordSuggestionsQuerySchema,
  assetRecommendationRequestSchema,
  skillBundleQuerySchema,
} from '@capability-hub/contracts';
import { fail, HubError } from '@capability-hub/domain/errors';
import type { Express } from 'express';
import { finished } from 'node:stream/promises';
import { z } from 'zod';
import { createClientConfiguration } from '../../integrations/client-config.js';
import type { HttpContext } from '../context.js';
import { withRevision as etag, jsonRoute as send } from '../response.js';

/** 读取入口解析可选身份，应用服务核对发布受众。 */
export function registerCatalogRoutes(app: Express, { hub, security }: HttpContext): void {
  const read = security.optionalAuthenticate;
  const bundlePath = '/api/catalog/skill-bundle';
  let activeBundles = 0;
  app.head(bundlePath, (_req, res) => {
    res.set('Allow', 'GET').status(405).end();
  });
  app.get(bundlePath, read, async (req, res) => {
    const { signal } = req;
    if (signal.aborted || res.destroyed) return;
    const { version_id } = skillBundleQuerySchema.parse(req.query);
    // 取消不会提前归还名额：已开始的读取、压缩或响应写出须先收尾。
    if (activeBundles >= 2)
      throw new HubError(429, 'SKILL_BUNDLE_BUSY', '同时下载的合包过多，请稍后再试', {}, true);
    activeBundles++;
    try {
      const bytes = await hub.content.getSkillBundle(
        res.locals.viewer ?? null,
        version_id,
        async () => {
          if (!res.locals.session) return null;
          const session = await security.session(req);
          signal.throwIfAborted();
          if (!session || session.id !== res.locals.session.id)
            fail(401, 'UNAUTHENTICATED', '会话已失效，请重新登录');
          return await hub.identity.principal(session.user_id);
        },
        signal,
      );
      signal.throwIfAborted();
      res.set({
        'Content-Type': 'application/zip',
        'Content-Disposition': 'attachment; filename="capability-hub-skills.zip"',
        'Content-Length': String(bytes.length),
      });
      res.end(bytes);
      await finished(res, { cleanup: true });
    } catch (error) {
      if (!signal.aborted && !res.destroyed) throw error;
    } finally {
      activeBundles--;
    }
  });
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
      etag(
        res,
        await hub.catalog.getDetail(
          res.locals.viewer ?? null,
          String(req.params.id),
          req.query.latest_readable === '1',
        ),
      ),
    ),
  );
  app.get(
    '/api/assets/:id/versions',
    read,
    send(
      async (req, res) =>
        await hub.catalog.listHistory(
          res.locals.viewer ?? null,
          String(req.params.id),
          req.query.latest_readable === '1',
        ),
    ),
  );
  app.get(
    '/api/assets/:id/versions/:versionId',
    read,
    send(async (req, res) =>
      etag(
        res,
        await hub.catalog.getVersionById(
          res.locals.viewer ?? null,
          String(req.params.id),
          String(req.params.versionId),
        ),
      ),
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
        await hub.feedback.get(res.locals.principal, z.uuid().parse(req.params.id)),
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
          z.uuid().parse(req.params.id),
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
