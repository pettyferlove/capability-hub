import type { RecordMap, TableName } from '@capability-hub/domain/models';
import type { RecordStore } from '@capability-hub/application/ports';
import { tables } from '../tables.js';
export type StoreSnapshot = { [K in TableName]: RecordMap[K][] };
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
export async function snapshotStore(store: RecordStore): Promise<StoreSnapshot> {
  return store.tx(async () => {
    const entries = [];
    for (const table of tables) entries.push([table, await store.all(table)]);
    return Object.fromEntries(entries) as StoreSnapshot;
  });
}
/** 只向已初始化的空数据库恢复，关联与不可变约束在同一事务内校验。 */
export async function restoreStore(store: RecordStore, snapshot: StoreSnapshot): Promise<void> {
  await store.tx(async () => {
    for (const table of tables)
      if ((await store.all(table)).length) throw new Error('恢复目标数据库必须为空');
    for (const table of restoreOrder)
      for (const row of snapshot[table]) await store.insert(table, row);
  });
}
