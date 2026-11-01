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

/**
 * 上传与运营视图。`POST /api/intakes` 只接受一个 multipart 文件：multer 在内存中限制单文件
 * ≤20 MiB、字段数 1、字段 ≤16 KiB、part 数 2，`metadata` 再按契约 schema 校验；该接口与
 * `rescan` 都读 `Idempotency-Key`，重复提交返回同一结果，两者都以 202 表示已入队，
 * 真正的解析在 worker 中进行。`retry` 不带幂等键，由服务层按 intake 当前状态判断是否可重试。
 * 读取与操作均按 `principal` 收敛到调用者可见的 intake，越权与不存在都由服务层抛错。
 */
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
