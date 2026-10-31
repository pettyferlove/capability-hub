import { z } from 'zod';
import {
  submitAiExecutionRequestSchema,
  respondAiInteractionRequestSchema,
  listAiExecutionsQuerySchema,
} from '@capability-hub/contracts';
import { AiError, digest } from '@capability-hub/ai';
import { fail } from '@capability-hub/domain/errors';
import type { Express, Request } from 'express';
import type { HttpContext } from '../context.js';
import { idempotencyKey, jsonRoute, withRevision } from '../response.js';
import { executionResponse, executionView } from './ai-views.js';
import { streamAiEvents } from './ai-events.js';

function revision(request: Pick<Request, 'get'>) {
  const value = request.get('If-Match');
  if (!value) fail(428, 'IF_MATCH_REQUIRED', '请提供 If-Match 并发条件');
  const match = /^"([1-9]\d*)"$/.exec(value);
  if (!match || !Number.isSafeInteger(Number(match[1])))
    fail(412, 'REVISION_CONFLICT', '修订号无效');
  return Number(match[1]);
}
export function registerAiRoutes(app: Express, context: HttpContext) {
  const { hub, security } = context;
  const runtime = hub.ai.runtime;
  app.use('/api/ai', (req, _res, next) => {
    void security
      .session(req)
      .then((session) => {
        if (!session) fail(401, 'UNAUTHENTICATED', 'AI 工作台需要登录会话');
        next();
      })
      .catch(next);
  });
  app.get(
    '/api/ai/catalog',
    jsonRoute(async (_req, res) => {
      await hub.ai.principal(res.locals.principal);
      return runtime.catalog();
    }),
  );
  app.post(
    '/api/ai/executions',
    jsonRoute(async (req, res) => {
      const input = submitAiExecutionRequestSchema.parse(req.body);
      const principal = await hub.ai.principal(res.locals.principal);
      const result = await hub.idempotency.execute(
        principal,
        'ai.execute',
        idempotencyKey(req),
        'sha256:' + digest(input),
        async () =>
          executionResponse(
            await runtime.submit(
              principal.id,
              input.operation_id,
              input.input,
              input.model_profile,
            ),
          ),
      );
      res.status(201);
      return withRevision(res, result);
    }),
  );
  app.get(
    '/api/ai/executions',
    jsonRoute(async (req, res) => {
      const principal = await hub.ai.principal(res.locals.principal);
      const query = listAiExecutionsQuerySchema.parse(req.query);
      let after: { position: number; id: string } | undefined;
      if (query.cursor) {
        let data: unknown;
        try {
          data = JSON.parse(Buffer.from(query.cursor, 'base64url').toString('utf8')) as unknown;
        } catch {
          fail(422, 'AI_CURSOR_INVALID', '列表游标无效');
        }
        after = z
          .object({ position: z.number().int().nonnegative(), id: z.string().uuid() })
          .strict()
          .parse(data);
      }
      const rows = await runtime.store.list('ai_executions', {
        owner_id: principal.id,
        descending: true,
        after,
        limit: query.limit,
      });
      const last = rows.at(-1);
      const visible = [];
      for (const row of rows) {
        try {
          await hub.ai.principal(principal, row, true);
          visible.push(executionResponse(row));
        } catch (error) {
          if (!(error instanceof AiError && ['AI_FORBIDDEN', 'AI_NOT_FOUND'].includes(error.code)))
            throw error;
        }
      }
      return {
        items: visible,
        next_cursor:
          rows.length === query.limit && last
            ? Buffer.from(JSON.stringify({ position: last.position, id: last.id })).toString(
                'base64url',
              )
            : null,
      };
    }),
  );
  app.get(
    '/api/ai/executions/:id',
    jsonRoute(async (req, res) => {
      const id = String(req.params.id);
      const view = await runtime.store.tx(async () => {
        const snapshot = await runtime.view(id);
        await hub.ai.principal(res.locals.principal, snapshot.execution, true);
        return executionView(snapshot);
      });
      res.set('ETag', `"${view.execution.revision}"`);
      return view;
    }),
  );
  app.post(
    '/api/ai/executions/:id/cancel',
    jsonRoute(async (req, res) => {
      z.object({}).strict().parse(req.body);
      const id = String(req.params.id);
      const expected = revision(req);
      const principal = await hub.ai.principal(res.locals.principal, await runtime.get(id));
      const result = await hub.idempotency.execute(
        principal,
        `ai.cancel:${id}`,
        idempotencyKey(req),
        'sha256:' + digest({ id, expected }),
        async () => executionResponse(await runtime.cancel(id, principal.id, expected)),
      );
      return withRevision(res, result);
    }),
  );
  app.post(
    '/api/ai/executions/:id/interactions/:interactionId/respond',
    jsonRoute(async (req, res) => {
      const id = String(req.params.id);
      const interactionId = String(req.params.interactionId);
      const expected = revision(req);
      const input = respondAiInteractionRequestSchema.parse(req.body);
      const principal = await hub.ai.principal(res.locals.principal, await runtime.get(id));
      const hash = 'sha256:' + digest({ input, expected });
      const result = await hub.idempotency.execute(
        principal,
        `ai.respond:${interactionId}`,
        idempotencyKey(req),
        hash,
        async () =>
          executionResponse(
            await runtime.respond(id, interactionId, principal.id, expected, input.response),
          ),
      );
      return withRevision(res, result);
    }),
  );
  app.get(
    '/api/ai/executions/:id/events',
    jsonRoute((req, res) => streamAiEvents(req, res, context)),
  );
}
