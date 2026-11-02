import { z } from 'zod';
import type { Express } from 'express';
import { aiExecutionDiagnosticsResponseSchema } from '@capability-hub/contracts';
import type { AiRecordQuery, AiStore } from '@capability-hub/ai/ports';
import type { AiRecordMap } from '@capability-hub/ai/records';
import type { Principal } from '@capability-hub/domain/identity';
import type { HttpContext } from '../../context.js';
import { jsonRoute } from '../../response.js';
import { diagnosticMarkdown } from './diagnostic-markdown.js';
import { executionResponse, interactionResponse, visibleArtifacts } from '../ai-views.js';

async function executionRows<K extends keyof AiRecordMap>(
  store: AiStore,
  table: K,
  executionId: string,
  filter: Pick<AiRecordQuery, 'lookup_key' | 'before_position'> = {},
) {
  const rows: AiRecordMap[K][] = [];
  let after: AiRecordQuery['after'];
  for (;;) {
    const page = await store.list(table, {
      execution_id: executionId,
      ...filter,
      after,
      limit: 500,
    });
    rows.push(...page);
    if (page.length < 500) return rows;
    const last = page[page.length - 1];
    after = { position: last.position, id: last.id };
  }
}

/** 授权、事件水位和派生内容共用事务，活动快照的展示上限不适用于诊断导出。 */
function executionDiagnostics(hub: HttpContext['hub'], actor: Principal, id: string) {
  const runtime = hub.ai.runtime;
  return runtime.store.tx(async () => {
    const principal = await hub.ai.consolePrincipal(actor);
    const row = await runtime.get(id);
    await hub.ai.principal(principal, row, true);
    const payload = row.payload;
    const history = await executionRows(runtime.store, 'ai_events', id, {
      lookup_key: id + ':operator',
      before_position: payload.last_seq + 1,
    });
    const eventGaps = [];
    let next = 1;
    for (const event of history) {
      if (next < event.payload.seq)
        eventGaps.push({ from_seq: next, through_seq: event.payload.seq - 1 });
      next = event.payload.seq + 1;
    }
    if (next <= payload.last_seq) eventGaps.push({ from_seq: next, through_seq: payload.last_seq });
    const calls = await executionRows(runtime.store, 'ai_calls', id);
    const traces = await executionRows(runtime.store, 'ai_traces', id);
    const interactions = await executionRows(runtime.store, 'ai_interactions', id);
    const effects = await executionRows(runtime.store, 'ai_effects', id);
    const artifacts = await executionRows(runtime.store, 'ai_artifacts', id);
    return aiExecutionDiagnosticsResponseSchema.parse({
      schema_version: 1,
      captured_at: new Date().toISOString(),
      watermark: payload.last_seq,
      event_gaps: eventGaps,
      execution: executionResponse(row),
      owner_display_name:
        (await hub.store.get('users', row.owner_id))?.display_name ?? row.owner_id,
      workflow: {
        workflow_id: payload.native_workflow_id,
        run_id: payload.native_run_id,
        definition_version: payload.definition_version,
        definition_digest: payload.definition_digest,
        model_digest: payload.model_digest,
      },
      events: history.map((event) => ({ ...event.payload, execution_id: id })),
      model_calls: calls.map((call) => ({
        id: call.id,
        status: call.status,
        started_at: call.created_at,
        updated_at: call.updated_at,
        ...call.payload,
      })),
      traces: traces.map((trace) => ({
        id: trace.id,
        name: trace.payload.name,
        parent_id: trace.payload.parent_id,
        started_at: new Date(trace.position).toISOString(),
        duration_ms: trace.payload.duration_ms,
      })),
      interactions: interactions.map((item) => ({
        ...interactionResponse(item),
        step_path: item.payload.native_path,
        responded_by: item.payload.responded_by,
        updated_at: item.updated_at,
      })),
      effects: effects.map((effect) => ({
        id: effect.id,
        status: effect.status,
        created_at: effect.created_at,
        tool_id: effect.payload.tool_id,
        arguments_digest: effect.payload.arguments_digest,
      })),
      artifacts: visibleArtifacts(artifacts),
      resources: artifacts.flatMap(({ payload: artifact }) => {
        const value = artifact.content;
        if (
          !artifact.name.startsWith('resource:') ||
          !value ||
          typeof value !== 'object' ||
          Array.isArray(value) ||
          typeof value.id !== 'string'
        )
          return [];
        return [
          { reference: value.id, digest: typeof value.digest === 'string' ? value.digest : null },
        ];
      }),
    });
  });
}

/** 注册在 AI 会话校验之后，快照和导出共用执行检查权限。 */
export function registerExecutionDiagnosticsRoute(app: Express, hub: HttpContext['hub']) {
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
}
