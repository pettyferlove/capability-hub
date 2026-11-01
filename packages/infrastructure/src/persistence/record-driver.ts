import type { RecordStore } from '@capability-hub/application/ports';
import type { AiQueries } from '@capability-hub/ai/ports';

/**
 * 通用记录查询的最小子集：只保留按表名读写 JSON 记录的能力，不含迁移、AI 表与生命周期管理。
 * `insert`/`put`/`remove` 均不带事务语义——事务由 {@link RecordDriver.transaction} 提供。
 */
export type RecordQueries = Pick<
  RecordStore,
  'get' | 'all' | 'where' | 'insert' | 'put' | 'remove' | 'revision' | 'health'
>;

/**
 * 存储驱动对上层暴露的统一契约，SQLite 与 PostgreSQL 各有一份实现。
 *
 * `exclusive` 在 SQLite 上落到同一个串行执行器，同一驱动的其它操作会排队等待，因此回调必须短小，
 * 且不能在回调内再次调用 `exclusive`（会排在自身之后，永久等待）。需要事务时用 `transaction`，
 * `PersistenceSession` 就是按 `exclusive(() => transaction(...))` 调用的。`transaction` 的回调拿到
 * 绑定该事务的查询对象，改用外部查询会读到事务之外的数据。`close` 之后所有操作不再可用，
 * 实现需保证清理幂等（SQLite 还要归还在执行器池中的引用计数）。
 */
export interface RecordDriver {
  readonly kind: RecordStore['kind'];
  readonly queries: RecordQueries;
  readonly ai: AiQueries;
  exclusive<T>(work: () => Promise<T>): Promise<T>;
  transaction<T>(work: (queries: RecordQueries, ai: AiQueries) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}
