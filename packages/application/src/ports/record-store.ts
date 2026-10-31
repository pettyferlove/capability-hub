import type { RecordMap, TableName } from '@capability-hub/domain/models';

/** 持久化调用统一异步，嵌套操作共享同一事务。 */
export interface RecordStore {
  readonly kind: 'sqlite' | 'postgresql';
  get<K extends TableName>(
    table: K,
    id: string | null | undefined,
  ): Promise<RecordMap[K] | undefined>;
  all<K extends TableName>(table: K): Promise<RecordMap[K][]>;
  where<K extends TableName>(
    table: K,
    key: keyof RecordMap[K] & string,
    value: string,
  ): Promise<RecordMap[K][]>;
  find<K extends TableName>(
    table: K,
    key: keyof RecordMap[K] & string,
    value: string,
  ): Promise<RecordMap[K] | undefined>;
  insert<K extends TableName>(table: K, record: RecordMap[K]): Promise<RecordMap[K]>;
  put<K extends TableName>(table: K, record: RecordMap[K]): Promise<RecordMap[K]>;
  remove(table: TableName, id: string): Promise<void>;
  tx<T>(work: () => T | Promise<T>): Promise<T>;
  audit(
    actor: string,
    action: string,
    entityId: string,
    reason?: string,
    metadata?: Record<string, unknown>,
  ): Promise<void>;
  revision(): Promise<string>;
  health(): Promise<void>;
  close(): Promise<void>;
}
