import { z } from 'zod';
import type { Express } from 'express';
import {
  aiExecutionDiagnosticsResponseSchema,
  aiModelExchangeResponseSchema,
  operationsAgentApi,
  type AiExecutionDiagnosticsResponse,
  type AiCallFailureReason,
} from '@capability-hub/contracts';
import { AiError, type ExecutionRecord } from '@capability-hub/ai';
import type { AiRecordQuery, AiStore } from '@capability-hub/ai/ports';
import type { AiRecordMap } from '@capability-hub/ai/records';
import { fail } from '@capability-hub/domain/errors';
import type { Principal } from '@capability-hub/domain/identity';
import type { HttpContext } from '../../context.js';
import { jsonRoute } from '../../response.js';
import { diagnosticMarkdown, terminalCall } from './diagnostic-markdown.js';
import { executionResponse, interactionResponse, visibleArtifacts } from '../ai-views.js';
import { executionOwnerName } from '../../../operations/execution-owner.js';

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

/** 输出结论优先；传输层原因只从已结算失败调用的诊断推导，成功或待结算的调用没有失败原因。 */
function failureReason(call: AiRecordMap['ai_calls']): AiCallFailureReason | undefined {
  const check = call.payload.output_check;
  if (check?.status === 'rejected') return check.reason;
  if (call.status !== 'failed') return undefined;
  const code = call.payload.error_code;
  if (code === 'AI_CANCELLED') return 'cancelled';
  if (code === 'AI_DEADLINE_EXCEEDED') return 'execution_timeout';
  const transport = call.payload.diagnostics.transport;
  if (!transport) return undefined;
  if (transport.http_status === 429) return 'rate_limited';
  if (transport.http_status !== undefined && transport.http_status >= 400) return 'http_error';
  if (transport.request_timed_out) return 'request_timeout';
  if (code === 'AI_STREAM_INCOMPLETE') return 'stream_incomplete';
  if (
    code === 'AI_PROVIDER_FAILED' &&
    (transport.network_error || transport.http_status === undefined)
  )
    return 'network';
}

function exchangeResponse(row: AiRecordMap['ai_exchanges']) {
  return {
    call_id: row.id,
    captured_at: row.created_at,
    resource_refs: row.payload.resource_refs,
    request: row.payload.request,
    response: row.payload.response,
  };
}

function inspectExecution<T>(
  hub: HttpContext['hub'],
  actor: Principal,
  id: string,
  read: (row: ExecutionRecord, viewer: Principal) => Promise<T>,
) {
  const runtime = hub.ai.runtime;
  return runtime.store.tx(async () => {
    const principal = await hub.ai.consolePrincipal(actor);
    const row = await runtime.get(id);
    const viewer = await hub.ai.principal(principal, row, true);
    return read(row, viewer);
  });
}

/** 授权、事件水位与原文可用性属于同一快照；正文留给单条或有界的下载请求。 */
function executionDiagnostics(hub: HttpContext['hub'], actor: Principal, id: string) {
  const runtime = hub.ai.runtime;
  return inspectExecution(hub, actor, id, async (row, viewer) => {
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
    const availability = new Map<string, 'available' | 'withheld'>();
    for (const item of await hub.ai.retainedExchangeRefs(id)) {
      const readable = await hub.ai.canReadExchange(viewer, item.resource_refs, row);
      availability.set(item.id, readable ? 'available' : 'withheld');
    }
    const modelCalls: AiExecutionDiagnosticsResponse['model_calls'] = calls.map((call) => ({
      id: call.id,
      status: call.status,
      started_at: call.created_at,
      updated_at: call.updated_at,
      ...call.payload,
      failure_reason: failureReason(call),
      exchange: availability.get(call.id) ?? 'none',
    }));
    return aiExecutionDiagnosticsResponseSchema.parse({
      schema_version: 2,
      captured_at: new Date().toISOString(),
      watermark: payload.last_seq,
      event_gaps: eventGaps,
      execution: { ...executionResponse(row), error: payload.error },
      owner_display_name: await executionOwnerName(hub.store, row.owner_id),
      workflow: {
        workflow_id: payload.native_workflow_id,
        run_id: payload.native_run_id,
        definition_version: payload.definition_version,
        definition_digest: payload.definition_digest,
        model_digest: payload.model_digest,
      },
      events: history.map((event) => ({ ...event.payload, execution_id: id })),
      model_calls: modelCalls,
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

/** 在调用方的授权事务内，先检查时限和引用，再读取正文。 */
async function readExchange(
  hub: HttpContext['hub'],
  row: ExecutionRecord,
  viewer: Principal,
  callId: string,
) {
  const [ref] = await hub.ai.retainedExchangeRefs(row.id, callId);
  if (!ref) throw new AiError('AI_NOT_FOUND', '往返原文不存在或已超过留存期');
  if (!(await hub.ai.canReadExchange(viewer, ref.resource_refs, row)))
    throw new AiError('AI_FORBIDDEN', '往返原文涉及当前账号无权读取的资源');
  const stored = await hub.ai.runtime.store.get('ai_exchanges', callId);
  if (!stored || stored.execution_id !== row.id)
    throw new AiError('AI_NOT_FOUND', '往返原文不存在或已超过留存期');
  return exchangeResponse(stored);
}

const maxExportBytes = 8 * 1024 * 1024;

function checkExportSize(bytes: number) {
  if (bytes > maxExportBytes)
    fail(413, 'DIAGNOSTIC_EXPORT_TOO_LARGE', '诊断导出超过 8 MiB，请查看快照并逐条读取往返原文');
}

async function exportDiagnostics(
  hub: HttpContext['hub'],
  actor: Principal,
  report: AiExecutionDiagnosticsResponse,
  format: 'json' | 'markdown',
) {
  const cause = terminalCall(report);
  const selected = format === 'json' ? report.model_calls : cause ? [cause] : [];
  const available = selected.filter((call) => call.exchange === 'available');
  const exchanges: NonNullable<AiExecutionDiagnosticsResponse['exchanges']> = [];
  let bytes = 0;
  // 分段复查授权；不在持有全局写锁的事务内装载整份导出。
  for (let i = 0; i < available.length; i += 8) {
    await inspectExecution(hub, actor, report.execution.id, async (row, viewer) => {
      for (const call of available.slice(i, i + 8)) {
        const exchange = await readExchange(hub, row, viewer, call.id);
        bytes += Buffer.byteLength(JSON.stringify(exchange));
        checkExportSize(bytes);
        exchanges.push(exchange);
      }
    });
  }
  report.exchanges = exchanges;
  const text = format === 'json' ? JSON.stringify(report) : diagnosticMarkdown(report);
  checkExportSize(Buffer.byteLength(text));
  return text;
}

/** 诊断快照和导出均复查当前任务的读取权限。 */
export function registerExecutionDiagnosticsRoute(app: Express, hub: HttpContext['hub']) {
  app.get(
    operationsAgentApi.executions + '/:id/diagnostics',
    jsonRoute(async (req, res) => {
      const query = z
        .union([
          z.object({ download: z.enum(['json', 'markdown']).optional() }).strict(),
          z.object({ view: z.literal('handoff') }).strict(),
        ])
        .parse(req.query);
      const actor = res.locals.principal;
      res.set('Cache-Control', 'private, no-store');
      const report = await executionDiagnostics(hub, actor, String(req.params.id));
      const format = 'view' in query ? 'markdown' : query.download;
      if (!format) return report;
      const text = await exportDiagnostics(hub, actor, report, format);
      if ('view' in query) return { markdown: text, watermark: report.watermark };
      const json = format === 'json';
      res.attachment(
        `agent-${report.execution.id}-seq-${report.watermark}.${json ? 'json' : 'md'}`,
      );
      res.type(json ? 'application/json' : 'text/markdown').send(text);
    }),
  );
  app.get(
    operationsAgentApi.executions + '/:id/calls/:callId/exchange',
    jsonRoute(async (req, res) => {
      const exchange = await inspectExecution(
        hub,
        res.locals.principal,
        String(req.params.id),
        (row, viewer) => readExchange(hub, row, viewer, String(req.params.callId)),
      );
      res.set('Cache-Control', 'private, no-store');
      return aiModelExchangeResponseSchema.parse(exchange);
    }),
  );
}
