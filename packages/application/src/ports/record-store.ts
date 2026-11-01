import type { RecordMap, TableName } from '@capability-hub/domain/models';

/**
 * 持久化调用统一异步，嵌套操作共享同一事务。
 *
 * 实现方必须保证的语义：
 * - `tx` 可嵌套：内层直接加入外层，最外层结束才提交，中途抛错回滚其全部写入。
 * - 未显式 `tx` 的调用各自独立，实现通常串行化到单个连接，因此**没有行级锁**；
 *   跨读取的并发安全只能靠记录自增 `revision` 加乐观校验（见 `matchRevision`）。
 * - `insert`/`put`/`remove`/`audit` 自带（可嵌套的）事务，可在外层事务里直接调用。
 */
export interface RecordStore {
  readonly kind: 'sqlite' | 'postgresql';
  /** `id` 为空时返回 `undefined` 而不是抛错，便于按可选外键查询。 */
  get<K extends TableName>(
    table: K,
    id: string | null | undefined,
  ): Promise<RecordMap[K] | undefined>;
  all<K extends TableName>(table: K): Promise<RecordMap[K][]>;
  /** 无索引保证，返回顺序由驱动决定，需要稳定顺序时调用方自行排序。 */
  where<K extends TableName>(
    table: K,
    key: keyof RecordMap[K] & string,
    value: string,
  ): Promise<RecordMap[K][]>;
  /** 取 `where` 的第一条；多条匹配时结果依赖驱动返回顺序。 */
  find<K extends TableName>(
    table: K,
    key: keyof RecordMap[K] & string,
    value: string,
  ): Promise<RecordMap[K] | undefined>;
  /** 主键已存在即抛错（HTTP 层映射为 409），不会静默覆盖。 */
  insert<K extends TableName>(table: K, record: RecordMap[K]): Promise<RecordMap[K]>;
  /** 整条 upsert：调用方提交的字段即最终状态，未给出的字段不会被保留。 */
  put<K extends TableName>(table: K, record: RecordMap[K]): Promise<RecordMap[K]>;
  /** 删除不存在的记录视为成功，便于重试。 */
  remove(table: TableName, id: string): Promise<void>;
  /** 事务边界；嵌套时沿用外层作用域与串行队列，不会另开独立事务。 */
  tx<T>(work: () => T | Promise<T>): Promise<T>;
  /**
   * 写一条审计记录并顺带固化操作者与对象的展示快照；结果类别与对象类型由
   * `auditDefinitions[action]` 推导，因此 `action` 必须是已登记的动作名。
   */
  audit(
    actor: string,
    action: string,
    entityId: string,
    reason?: string,
    metadata?: Record<string, unknown>,
  ): Promise<void>;
  /** 全局修订号（字符串比较），随写入变化，用作缓存键；不可当作并发令牌或单调数值。 */
  revision(): Promise<string>;
  health(): Promise<void>;
  close(): Promise<void>;
}
