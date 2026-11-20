import {
  hubFeedbackCommentRequestSchema,
  hubFeedbackCreateRequestSchema,
  hubFeedbackHandlerCommentRequestSchema,
  hubFeedbackLimits,
  hubFeedbackListQuerySchema,
  hubFeedbackQueueQuerySchema,
  hubFeedbackRedactionRequestSchema,
  hubFeedbackRefSchema,
  hubFeedbackUpdateRequestSchema,
  hubVersionHeaders,
  type HubFeedbackAttachmentKind,
} from '@capability-hub/contracts';
import type { HubFeedbackAccess, HubFeedbackUpload } from '@capability-hub/application';
import { fail } from '@capability-hub/domain/errors';
import { boundedJson } from '@capability-hub/infrastructure/content/json';
import { Router, type Express, type Request, type RequestHandler } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { hubBuild } from '../../hub-build.js';
import type { HttpContext } from '../context.js';
import { idempotencyKey, jsonRoute, withRevision } from '../response.js';
import { readSessionClient } from '../security/session-client.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: hubFeedbackLimits.imageBytes,
    files: hubFeedbackLimits.uploadFiles,
    fields: 1,
    fieldSize: hubFeedbackLimits.metadataBytes,
    parts: hubFeedbackLimits.uploadFiles + 2,
  },
}).array('files', hubFeedbackLimits.uploadFiles);
const metadata = z.strictObject({ metadata: z.string() });
const uuid = z.uuid();

function decodeMetadata(req: Pick<Request, 'body' | 'is'>) {
  if (!req.is('multipart/form-data')) fail(422, 'VALIDATION_ERROR', '请使用 multipart/form-data');
  return boundedJson(metadata.parse(req.body).metadata);
}

function uploadedFiles(
  req: Pick<Request, 'files'>,
  descriptors: readonly { part: number; kind: HubFeedbackAttachmentKind; name: string }[],
): HubFeedbackUpload[] {
  const files = Array.isArray(req.files) ? req.files : [];
  if (
    files.length !== descriptors.length ||
    new Set(descriptors.map((file) => file.part)).size !== files.length
  )
    fail(422, 'VALIDATION_ERROR', '附件与上传说明不一致');
  const result = new Array<HubFeedbackUpload>(files.length);
  for (const { part, kind, name } of descriptors) {
    const file = files[part];
    if (!file) fail(422, 'VALIDATION_ERROR', '附件与上传说明不一致');
    result[part] = { bytes: file.buffer, kind, name };
  }
  return result;
}

const mutation = (req: Pick<Request, 'get'>) => ({
  key: idempotencyKey(req),
  etag: req.get('If-Match'),
});
const sessionOnly: RequestHandler = (_req, res, next) => {
  if (!res.locals.session) fail(403, 'TOKEN_SCOPE', '此操作仅支持网页会话');
  next();
};

function feedbackDetailRoutes(router: Router, { hub }: HttpContext, access: HubFeedbackAccess) {
  router.get(
    '/:ref',
    jsonRoute(async (req, res) =>
      withRevision(
        res,
        await hub.hubFeedback.detail(
          res.locals.principal,
          access,
          hubFeedbackRefSchema.parse(req.params.ref),
        ),
      ),
    ),
  );
  router.get('/:id/attachments/:aid', async (req, res) => {
    const file = await hub.hubFeedback.attachment(
      res.locals.principal,
      access,
      uuid.parse(req.params.id),
      uuid.parse(req.params.aid),
    );
    const name = encodeURIComponent(file.name.replace(/[\uD800-\uDFFF]/gu, '\uFFFD')).replace(
      /['()*]/g,
      (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
    );
    const disposition = file.mediaType.startsWith('image/') ? 'inline' : 'attachment';
    res.set({
      'Content-Type': file.mediaType,
      'Content-Disposition': `${disposition}; filename*=UTF-8''${name}`,
      'Content-Security-Policy': "default-src 'none'; img-src 'self'; sandbox",
      'Cross-Origin-Resource-Policy': 'same-origin',
      'Content-Length': String(file.bytes.length),
    });
    res.end(file.bytes);
  });
  router.post(
    '/:id/comments',
    upload,
    jsonRoute(async (req, res) => {
      const input = decodeMetadata(req);
      const { body, files, visibility } =
        access === 'handler'
          ? hubFeedbackHandlerCommentRequestSchema.parse(input)
          : { ...hubFeedbackCommentRequestSchema.parse(input), visibility: 'public' as const };
      return withRevision(
        res,
        await hub.hubFeedback.comment(
          res.locals.principal,
          access,
          uuid.parse(req.params.id),
          body,
          visibility,
          uploadedFiles(req, files),
          mutation(req),
        ),
      );
    }),
  );
  router.delete(
    '/:id/attachments/:aid',
    sessionOnly,
    jsonRoute(async (req, res) =>
      withRevision(
        res,
        await hub.hubFeedback.removeAttachment(
          res.locals.principal,
          access,
          uuid.parse(req.params.id),
          uuid.parse(req.params.aid),
          mutation(req),
        ),
      ),
    ),
  );
}

export function registerHubFeedbackRoutes(app: Express, context: HttpContext): void {
  const { hub } = context;
  const self = Router();
  self.use(sessionOnly);
  self.post(
    '/',
    upload,
    jsonRoute(async (req, res) => {
      const { files, ...input } = hubFeedbackCreateRequestSchema.parse(decodeMetadata(req));
      const result = await hub.hubFeedback.create(
        res.locals.principal,
        input,
        uploadedFiles(req, files),
        {
          channel: 'web',
          credential_type: 'session',
          token_name: null,
          received_at: new Date().toISOString(),
          request_id: res.locals.request_id,
          ...hubBuild,
          web_build: res.get(hubVersionHeaders.webBuild) ?? null,
          client: readSessionClient(req.get('User-Agent')),
        },
        idempotencyKey(req),
      );
      res.status(201);
      return withRevision(res, result);
    }),
  );
  self.get(
    '/',
    jsonRoute(
      async (req, res) =>
        await hub.hubFeedback.list(
          res.locals.principal,
          'submitter',
          hubFeedbackListQuerySchema.parse(req.query),
        ),
    ),
  );
  self.get(
    '/summary',
    jsonRoute(
      async (_req, res) => await hub.hubFeedback.summary(res.locals.principal, 'submitter'),
    ),
  );
  self.post(
    '/:id/close',
    jsonRoute(async (req, res) =>
      withRevision(
        res,
        await hub.hubFeedback.close(res.locals.principal, uuid.parse(req.params.id), mutation(req)),
      ),
    ),
  );
  self.post(
    '/:id/read',
    jsonRoute(async (req, res) =>
      withRevision(
        res,
        await hub.hubFeedback.markRead(
          res.locals.principal,
          uuid.parse(req.params.id),
          mutation(req),
        ),
      ),
    ),
  );
  feedbackDetailRoutes(self, context, 'submitter');
  app.use('/api/hub-feedback', self);

  const queue = Router();
  queue.use(sessionOnly, (_req, res, next) => {
    hub.identity.require(res.locals.principal, 'feedback:manage');
    next();
  });
  queue.get(
    '/',
    jsonRoute(async (req, res) => {
      const { assignee, awaiting, ...query } = hubFeedbackQueueQuerySchema.parse(req.query);
      return await hub.hubFeedback.list(res.locals.principal, 'handler', {
        ...query,
        assignee:
          assignee === 'me' ? res.locals.principal.id : assignee === 'none' ? null : assignee,
        awaiting: awaiting === '1' ? true : undefined,
      });
    }),
  );
  queue.get(
    '/summary',
    jsonRoute(async (_req, res) => await hub.hubFeedback.summary(res.locals.principal, 'handler')),
  );
  queue.patch(
    '/:id',
    jsonRoute(async (req, res) =>
      withRevision(
        res,
        await hub.hubFeedback.update(
          res.locals.principal,
          uuid.parse(req.params.id),
          hubFeedbackUpdateRequestSchema.parse(req.body),
          mutation(req),
        ),
      ),
    ),
  );
  queue.post(
    '/:id/redactions',
    jsonRoute(async (req, res) =>
      withRevision(
        res,
        await hub.hubFeedback.redact(
          res.locals.principal,
          uuid.parse(req.params.id),
          hubFeedbackRedactionRequestSchema.parse(req.body),
          mutation(req),
        ),
      ),
    ),
  );
  feedbackDetailRoutes(queue, context, 'handler');
  app.use('/api/admin/hub-feedback', queue);
}
