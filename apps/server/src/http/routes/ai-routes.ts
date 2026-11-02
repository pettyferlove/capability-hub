import { z } from 'zod';
import {
  submitAiExecutionRequestSchema,
  respondAiInteractionRequestSchema,
  listAiExecutionsQuerySchema,
} from '@capability-hub/contracts';
import { AiError, digest, type ExecutionRecord } from '@capability-hub/ai';
import { fail } from '@capability-hub/domain/errors';
import type { Principal } from '@capability-hub/domain/identity';
import type { Express, Request } from 'express';
import type { HttpContext } from '../context.js';
import { idempotencyKey, jsonRoute, withRevision } from '../response.js';
import { executionResponse, executionView } from './ai-views.js';
import { streamAiEvents } from './ai-events.js';
import { executionDiagnostics } from './ai-diagnostics.js';
import { diagnosticMarkdown } from './ai-diagnostic-markdown.js';

function revision(request: Pick<Request, 'get'>) {
  const value = request.get('If-Match');
  if (!value) fail(428, 'IF_MATCH_REQUIRED', '请提供 If-Match 并发条件');
  const match = /^"([1-9]\d*)"$/.exec(value);
  if (!match || !Number.isSafeInteger(Number(match[1])))
    fail(412, 'REVISION_CONFLICT', '修订号无效');
  return Number(match[1]);
}

type ExecutionCursor = Pick<ExecutionRecord, 'position' | 'id'>;

function encodeCursor(row?: ExecutionCursor) {
  return row
    ? Buffer.from(JSON.stringify({ position: row.position, id: row.id })).toString('base64url')
    : null;
}

async function canInspect(hub: HttpContext['hub'], principal: Principal, row: ExecutionRecord) {
  try {
    await hub.ai.principal(principal, row, true);
    return true;
  } catch (error) {
    if (error instanceof AiError && ['AI_FORBIDDEN', 'AI_NOT_FOUND'].includes(error.code))
      return false;
    throw error;
  }
}

async function consoleExecutionPage(
  hub: HttpContext['hub'],
  principal: Principal,
  query: z.infer<typeof listAiExecutionsQuerySchema>,
  after?: ExecutionCursor,
) {
  const visible: { row: ExecutionRecord; ownerName: string; title: string }[] = [];
  const owners = new Map([[principal.id, principal.display_name]]);
  const term = query.q?.toLocaleLowerCase();
  const agentTitles = new Map(
    hub.ai.runtime.catalog().operations.map((operation) => [operation.id, operation.title]),
  );
  const batchSize = query.limit + 1;
  while (visible.length <= query.limit) {
    const batch = await hub.ai.runtime.store.list('ai_executions', {
      after,
      descending: true,
      status: query.status,
      lookup_key: query.operation_id === 'feedback-triage' ? undefined : query.operation_id,
      limit: batchSize,
    });
    for (const row of batch) {
      if (query.operation_id && row.payload.operation_id !== query.operation_id) continue;
      if (!(await canInspect(hub, principal, row))) continue;
      const ownerName =
        owners.get(row.owner_id) ??
        (await hub.store.get('users', row.owner_id))?.display_name ??
        row.owner_id;
      owners.set(row.owner_id, ownerName);
      const input = row.payload.input;
      const title =
        input && typeof input === 'object' && !Array.isArray(input)
          ? (input.prompt ?? input.topic)
          : undefined;
      if (
        term &&
        ![
          row.id,
          row.owner_id,
          ownerName,
          row.payload.operation_id,
          agentTitles.get(row.payload.operation_id),
          title,
          row.payload.error?.code,
        ].some((value) => typeof value === 'string' && value.toLocaleLowerCase().includes(term))
      )
        continue;
      const text = typeof title === 'string' ? title.trim().replace(/\s+/g, ' ') : '';
      visible.push({
        row,
        ownerName,
        title:
          text.length > 100
            ? text.slice(0, 100) + '…'
            : text || agentTitles.get(row.payload.operation_id) || row.payload.operation_id,
      });
      if (visible.length > query.limit) break;
    }
    if (batch.length < batchSize) break;
    after = batch.at(-1);
  }
  return {
    items: visible.slice(0, query.limit).map(({ row, ownerName, title }) =>
      query.view === 'summary'
        ? {
            id: row.id,
            owner_id: row.owner_id,
            owner_display_name: ownerName,
            operation_id: row.payload.operation_id,
            status: row.status,
            created_at: row.created_at,
            title,
            error_code: row.payload.error?.code ?? null,
          }
        : { ...executionResponse(row), owner_display_name: ownerName },
    ),
    next_cursor: visible.length > query.limit ? encodeCursor(visible[query.limit - 1].row) : null,
  };
}

/**
 * AI 控制台与业务任务。整组先由 `/api/ai` 前置中间件要求登录会话（无会话 401 `UNAUTHENTICATED`），
 * 每条路由再用 `hub.ai.principal` 结合执行记录复核归属，越权按 `AI_FORBIDDEN`/`AI_NOT_FOUND` 处理，
 * 因此列表只输出调用者可见的执行。提交、取消、应答都走 `hub.idempotency.execute`：
 * 键来自 `Idempotency-Key`，请求体摘要参与去重，避免重试产生重复执行。
 * 取消与应答要求 `If-Match`（缺失 428、格式非法 412），返回体带 `ETag` 供下一次回填。
 * `events` 是 SSE，连接上限与存活期见 {@link streamAiEvents}。
 */
export function registerAiRoutes(app: Express, context: HttpContext) {
  const { hub, security } = context;
  const runtime = hub.ai.runtime;
  app.use('/api/ai', (req, _res, next) => {
    void security
      .session(req)
      .then((session) => {
        if (!session) fail(401, 'UNAUTHENTICATED', '访问 AI 任务需要登录会话');
        next();
      })
      .catch(next);
  });
  app.get(
    '/api/ai/catalog',
    jsonRoute((_req, res) => hub.ai.catalog(res.locals.principal)),
  );
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
      const businessTarget = query.version_id || query.feedback_id || query.publication_request_id;
      const principal = businessTarget
        ? await hub.ai.principal(res.locals.principal, undefined, true)
        : await hub.ai.consolePrincipal(res.locals.principal);
      let after: ExecutionCursor | undefined;
      if (query.cursor) {
        let data: unknown;
        try {
          data = JSON.parse(Buffer.from(query.cursor, 'base64url').toString('utf8')) as unknown;
        } catch {
          fail(422, 'AI_CURSOR_INVALID', '列表游标无效');
        }
        after = z
          .object({ position: z.number().int().nonnegative(), id: z.uuid() })
          .strict()
          .parse(data);
      }
      if (!businessTarget) return consoleExecutionPage(hub, principal, query, after);
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
    '/api/ai/executions/:id/diagnostics',
    jsonRoute(async (req, res) => {
      const query = z
        .union([
          z.object({ download: z.enum(['json', 'markdown']).optional() }).strict(),
          z.object({ view: z.literal('handoff') }).strict(),
        ])
        .parse(req.query);
      const report = await executionDiagnostics(hub, res.locals.principal, String(req.params.id));
      res.set('Cache-Control', 'private, no-store');
      if ('view' in query)
        return { markdown: diagnosticMarkdown(report), watermark: report.watermark };
      const { download } = query;
      if (download) {
        const name = `agent-${report.execution.id}-seq-${report.watermark}`;
        res.attachment(name + (download === 'json' ? '.json' : '.md'));
        if (download === 'markdown') {
          res.type('text/markdown').send(diagnosticMarkdown(report));
          return;
        }
      }
      return report;
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
