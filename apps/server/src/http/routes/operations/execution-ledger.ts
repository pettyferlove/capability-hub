import type { z } from 'zod';
import type { ExecutionRecord } from '@capability-hub/ai';
import type { agentExecutionLedgerQuerySchema } from '@capability-hub/contracts';
import type { Principal } from '@capability-hub/domain/identity';
import type { HttpContext } from '../../context.js';
import { decodeCursor, encodeCursor } from '../ai-execution-page.js';
import { executionResponse } from '../ai-views.js';
import { executionOwnerName } from '../../../operations/execution-owner.js';

function inputTitle(row: ExecutionRecord) {
  const input = row.payload.input;
  return input && typeof input === 'object' && !Array.isArray(input)
    ? (input.prompt ?? input.topic)
    : undefined;
}

/** 跨用户筛选先复核每个任务的资源权限，再按可读记录分页。 */
export async function executionLedgerPage(
  hub: HttpContext['hub'],
  principal: Principal,
  query: z.infer<typeof agentExecutionLedgerQuerySchema>,
) {
  const numbered = 'page' in query;
  const limit = numbered ? query.page_size : query.limit;
  const requestedPage = numbered ? query.page : 1;
  const batchSize = numbered ? 128 : limit + 1;
  const pageEnd = requestedPage * limit;
  let after = numbered ? undefined : decodeCursor(query.cursor);
  let total = 0;
  const rows: ExecutionRecord[] = [];
  const owners = new Map([[principal.id, principal.display_name]]);
  const ownerNameOf = async (id: string) => {
    const known = owners.get(id);
    if (known !== undefined) return known;
    const name = await executionOwnerName(hub.store, id);
    owners.set(id, name);
    return name;
  };
  const term = query.q?.toLocaleLowerCase() ?? '';
  const matches = (value: unknown) =>
    typeof value === 'string' && value.toLocaleLowerCase().includes(term);
  const agentTitles = new Map(
    hub.ai.runtime.catalog().operations.map((operation) => [operation.id, operation.title]),
  );
  for (;;) {
    const batch = await hub.ai.runtime.store.list('ai_executions', {
      after,
      descending: true,
      status: query.status,
      lookup_key: query.operation_id === 'feedback-triage' ? undefined : query.operation_id,
      limit: batchSize,
    });
    for (const row of batch) {
      const operation = row.payload.operation_id;
      if (query.operation_id && operation !== query.operation_id) continue;
      if (
        term &&
        !(
          matches(row.id) ||
          matches(row.owner_id) ||
          matches(operation) ||
          matches(agentTitles.get(operation)) ||
          matches(inputTitle(row)) ||
          matches(row.payload.error?.code) ||
          matches(await ownerNameOf(row.owner_id))
        )
      )
        continue;
      if (!(await hub.ai.canInspectConsoleExecution(principal, row))) continue;

      if (total < pageEnd) {
        // 保留最后一个可用页，避免越界时二次扫描。
        if (total % limit === 0) rows.length = 0;
        rows.push(row);
      }
      total++;
      if (!numbered && total > limit) break;
    }
    if ((!numbered && total > limit) || batch.length < batchSize) break;
    after = batch.at(-1);
  }
  const items = [];
  for (const row of rows) {
    const ownerName = await ownerNameOf(row.owner_id);
    if (query.view === 'summary') {
      const input = inputTitle(row);
      const text = typeof input === 'string' ? input.trim().replace(/\s+/g, ' ') : '';
      const operation = row.payload.operation_id;
      items.push({
        id: row.id,
        owner_id: row.owner_id,
        owner_display_name: ownerName,
        operation_id: operation,
        status: row.status,
        created_at: row.created_at,
        title:
          text.length > 100
            ? text.slice(0, 100) + '…'
            : text || agentTitles.get(operation) || operation,
        error_code: row.payload.error?.code ?? null,
      });
    } else {
      items.push({ ...executionResponse(row), owner_display_name: ownerName });
    }
  }
  return numbered
    ? {
        items,
        page: Math.min(requestedPage, Math.max(1, Math.ceil(total / limit))),
        page_size: limit,
        total,
      }
    : { items, next_cursor: total > limit ? encodeCursor(rows.at(-1)) : null };
}
