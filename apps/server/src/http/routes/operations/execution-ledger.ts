import type { z } from 'zod';
import type { ExecutionRecord } from '@capability-hub/ai';
import type { agentExecutionLedgerQuerySchema } from '@capability-hub/contracts';
import type { Principal } from '@capability-hub/domain/identity';
import type { HttpContext } from '../../context.js';
import { canInspect, encodeCursor, type ExecutionCursor } from '../ai-execution-page.js';
import { executionResponse } from '../ai-views.js';

/** 跨用户筛选先复核每个任务的资源权限，再按可读记录分页。 */
export async function executionLedgerPage(
  hub: HttpContext['hub'],
  principal: Principal,
  query: z.infer<typeof agentExecutionLedgerQuerySchema>,
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
