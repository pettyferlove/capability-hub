import { aiTables, terminalStatuses } from '@capability-hub/ai/records';
import type { RecordStore } from '@capability-hub/application/ports';
import { createAiStore } from '../persistence/ai/ai-store.js';

/**
 * 按保留期清理已终结的 AI 执行记录及其子表、关联 job，返回删除的执行条数。
 *
 * `retentionDays` 取值 7–3650 且必须为整数，否则直接抛错（不做默认纠正）。判定以 `updated_at`
 * 早于 cutoff 且状态属于 `terminalStatuses` 为准，并在每个执行记录的事务内**重新读取**一次再删，
 * 因此并发推进到新的状态或新增 pending/running job 时本轮会跳过，不会删掉仍在运行的执行。
 * 清理按 100 条分页顺序推进，每个执行记录删除子表时再按 1000 条分页，避免一次拉全表；
 * 单条失败会抛出并使该条事务回滚，是否继续由调用方决定。
 */
export async function purgeAiHistory(store: RecordStore, retentionDays = 30): Promise<number> {
  if (!Number.isInteger(retentionDays) || retentionDays < 7 || retentionDays > 3650)
    throw new Error('AI 保留期必须为 7 至 3650 天');
  const ai = createAiStore(store);
  const cutoff = Date.now() - retentionDays * 86400000;
  let after: { position: number; id: string } | undefined;
  let removed = 0;
  for (;;) {
    const rows = await ai.list('ai_executions', { before_position: cutoff, after, limit: 100 });
    for (const row of rows) {
      if (!terminalStatuses.has(row.status) || Date.parse(row.updated_at) >= cutoff) continue;
      await store.tx(async () => {
        const current = await ai.get('ai_executions', row.id);
        if (
          !current ||
          !terminalStatuses.has(current.status) ||
          Date.parse(current.updated_at) >= cutoff
        )
          return;
        const jobs = (await store.all('jobs')).filter(
          (job) => job.kind === 'ai_execution' && job.aggregate_id === row.id,
        );
        if (jobs.some((job) => ['queued', 'running'].includes(job.state))) return;
        for (const table of aiTables.filter((table) => table !== 'ai_executions')) {
          for (;;) {
            const children = await ai.list(table, { execution_id: row.id, limit: 1000 });
            for (const child of children) await ai.remove(table, child.id);
            if (children.length < 1000) break;
          }
        }
        for (const job of jobs) await store.remove('jobs', job.id);
        await ai.remove('ai_executions', row.id);
        removed++;
      });
    }
    if (rows.length < 100) return removed;
    const last = rows.at(-1)!;
    after = { id: last.id, position: last.position };
  }
}
