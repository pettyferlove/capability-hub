import { z } from 'zod';
import {
  submitAiExecutionRequestSchema,
  respondAiInteractionRequestSchema,
  listAiExecutionsQuerySchema,
} from '@capability-hub/contracts';
import { digest } from '@capability-hub/ai';
import { fail } from '@capability-hub/domain/errors';
import type { Express, Request } from 'express';
import type { HttpContext } from '../context.js';
import { idempotencyKey, jsonRoute, withRevision } from '../response.js';
import { executionResponse, executionView } from './ai-views.js';
import { streamAiEvents } from './ai-events.js';
import { canInspect, decodeCursor, encodeCursor } from './ai-execution-page.js';

function revision(request: Pick<Request, 'get'>) {
  const value = request.get('If-Match');
  if (!value) fail(428, 'IF_MATCH_REQUIRED', '请提供 If-Match 并发条件');
  const match = /^"([1-9]\d*)"$/.exec(value);
  if (!match || !Number.isSafeInteger(Number(match[1])))
    fail(412, 'REVISION_CONFLICT', '修订号无效');
  return Number(match[1]);
}

/**
 * 业务任务与共用执行接口。这些路由位于全站登录校验之后，无会话为 401 `UNAUTHENTICATED`，
 * 每条路由再用 `hub.ai.principal` 结合执行记录复核归属，越权按 `AI_FORBIDDEN`/`AI_NOT_FOUND` 处理，
 * 因此列表只输出调用者可见的执行。提交、取消、应答都走 `hub.idempotency.execute`：
 * 键来自 `Idempotency-Key`，请求体摘要参与去重，避免重试产生重复执行。
 * 取消与应答要求 `If-Match`（缺失 428、格式非法 412），返回体带 `ETag` 供下一次回填。
 * `events` 是 SSE，连接上限与存活期见 {@link streamAiEvents}。
 */
export function registerAiRoutes(app: Express, context: HttpContext) {
  const { hub } = context;
  const runtime = hub.ai.runtime;
  app.get(
    '/api/ai/model-options',
    jsonRoute((_req, res) => hub.ai.modelOptions(res.locals.principal)),
  );
  app.post(
    '/api/ai/executions',
    jsonRoute(async (req, res) => {
      const input = submitAiExecutionRequestSchema.parse(req.body);
      const principal = await hub.ai.submissionPrincipal(res.locals.principal, input.operation_id);
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
      if (input.operation_id === 'publication-review')
        await hub.ai.principal(principal, await runtime.get(result.id), true);
      res.status(201);
      return withRevision(res, result);
    }),
  );
  app.get(
    '/api/ai/executions',
    jsonRoute(async (req, res) => {
      const query = listAiExecutionsQuerySchema.parse(req.query);
      const principal = await hub.ai.principal(res.locals.principal, undefined, true);
      const after = decodeCursor(query.cursor);
      const rows = await runtime.store.list('ai_executions', {
        owner_id: principal.id,
        status: query.status,
        ...(query.publication_request_id && { lookup_key: 'publication-review' }),
        descending: true,
        after,
        limit: query.limit,
      });
      const last = rows.at(-1);
      const visible = [];
      for (const row of rows) {
        if (query.operation_id && row.payload.operation_id !== query.operation_id) continue;
        const target = row.payload.input;
        if (!target || typeof target !== 'object' || Array.isArray(target)) continue;
        if (query.version_id && target.version_id !== query.version_id) continue;
        if (query.feedback_id && target.feedback_id !== query.feedback_id) continue;
        if (
          query.publication_request_id &&
          target.publication_request_id !== query.publication_request_id
        )
          continue;
        if (await canInspect(hub, principal, row)) visible.push(executionResponse(row));
      }
      const shared =
        !after &&
        !query.publication_request_id &&
        query.feedback_id &&
        (!query.operation_id || query.operation_id === 'feedback-triage')
          ? await hub.ai.sharedTriage(principal, query.feedback_id, query.version_id)
          : undefined;
      return {
        items: visible,
        ...(shared && {
          automatic_triage: {
            ...executionResponse(shared.execution),
            owner_display_name: shared.ownerName,
          },
        }),
        next_cursor: rows.length === query.limit ? encodeCursor(last) : null,
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
