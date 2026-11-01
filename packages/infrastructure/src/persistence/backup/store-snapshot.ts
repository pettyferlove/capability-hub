import type { RecordMap, TableName } from '@capability-hub/domain/models';
import type { RecordStore } from '@capability-hub/application/ports';
import { tables } from '../tables.js';
import { aiTables, type AiRecordMap, type AiTable } from '@capability-hub/ai/records';
import { createAiStore } from '../ai/ai-store.js';
/**
 * 整库快照的序列化形态：业务表与 AI 表一一对应，键集合必须与当前 schema 完全吻合。
 * 内容按存储原样读出，不做投影、脱敏或重排。
 */
export type StoreSnapshot = { [K in TableName]: RecordMap[K][] } & {
  [K in AiTable]: AiRecordMap[K][];
};
const restoreOrder: readonly TableName[] = [
  'users',
  'groups',
  'roles',
  'memberships',
  'role_bindings',
  'sources',
  'assets',
  'bindings',
  'versions',
  'intakes',
  'scans',
  'requests',
  'releases',
  'jobs',
  'audit',
  'sessions',
  'tokens',
  'oauth_clients',
  'oauth_grants',
  'oauth_requests',
  'oauth_credentials',
  'git_credentials',
  'idempotency',
  'login_attempts',
  'cli_logins',
  'scenarios',
  'recommendations',
  'asset_feedback',
];
/**
 * 在单个事务内导出整库。业务表一次 `all` 读完；AI 表按 `position` 游标分页（每页 1000）
 * 以保证大表也不会一次性拉爆内存，并在同一事务快照里读到一致视图。
 * 事务期间持有读视图（SQLite 为串行执行器排队），导出耗时与数据量正相关，调用方需自行限流。
 */
export async function snapshotStore(store: RecordStore): Promise<StoreSnapshot> {
  return store.tx(async () => {
    const entries: [string, unknown][] = [];
    for (const table of tables) entries.push([table, await store.all(table)]);
    const ai = createAiStore(store);
    for (const table of aiTables) {
      const rows: AiRecordMap[AiTable][] = [];
      let after: { id: string; position: number } | undefined;
      for (;;) {
        const page = await ai.list(table, { limit: 1000, after });
        rows.push(...page);
        if (page.length < 1000) break;
        const last = page.at(-1)!;
        after = { id: last.id, position: last.position };
      }
      entries.push([table, rows]);
    }
    return Object.fromEntries(entries) as StoreSnapshot;
  });
}
/** 只向已初始化的空数据库恢复，关联与不可变约束在同一事务内校验。 */
export async function restoreStore(store: RecordStore, snapshot: StoreSnapshot): Promise<void> {
  await store.tx(async () => {
    const ai = createAiStore(store);
    for (const table of aiTables)
      if ((await ai.list(table, { limit: 1 })).length) throw new Error('恢复目标数据库必须为空');
    for (const table of tables)
      if ((await store.all(table)).length) throw new Error('恢复目标数据库必须为空');
    for (const table of restoreOrder)
      for (const row of snapshot[table]) await store.insert(table, row);
    for (const table of aiTables) for (const row of snapshot[table]) await ai.insert(table, row);
  });
}
