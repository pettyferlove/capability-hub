import { auditDefinitions } from '@capability-hub/domain/audit';
import type { RecordMap, TableName } from '@capability-hub/domain/models';
import type { RecordStore } from '@capability-hub/application/ports';
import { randomUUID } from 'node:crypto';
import { resolveAuditActor, resolveAuditSubject } from '@capability-hub/application/audit';
import type { RecordDriver, RecordQueries } from './record-driver.js';
import { openPostgresDriver, type PostgresOptions } from './postgresql/driver.js';
import { PersistenceSession } from './transaction/persistence-session.js';
import { bindPersistenceSession } from './ai/ai-store.js';
import { openSqliteDriver } from './sqlite/driver.js';

/**
 * 存储的两种部署形态：SQLite 只需文件路径（目录与文件由驱动按最小权限创建），
 * PostgreSQL 需要连接串与池大小。`driver` 是判别式，决定了超时、并发与迁移锁的实现。
 */
export type RecordStoreOptions = { driver: 'sqlite'; path: string } | PostgresOptions;

class DrizzleStore implements RecordStore {
  readonly kind: RecordStore['kind'];
  private readonly session: PersistenceSession;
  constructor(driver: RecordDriver) {
    this.kind = driver.kind;
    this.session = new PersistenceSession(driver);
    bindPersistenceSession(this, this.session);
  }
  private execute<T>(work: (queries: RecordQueries) => Promise<T>): Promise<T> {
    return this.session.execute((queries) => work(queries.records));
  }
  get<K extends TableName>(
    table: K,
    id: string | null | undefined,
  ): Promise<RecordMap[K] | undefined> {
    return this.execute((queries) => queries.get(table, id));
  }
  all<K extends TableName>(table: K): Promise<RecordMap[K][]> {
    return this.execute((queries) => queries.all(table));
  }
  where<K extends TableName>(
    table: K,
    key: keyof RecordMap[K] & string,
    value: string,
  ): Promise<RecordMap[K][]> {
    return this.execute((queries) => queries.where(table, key, value));
  }
  async find<K extends TableName>(
    table: K,
    key: keyof RecordMap[K] & string,
    value: string,
  ): Promise<RecordMap[K] | undefined> {
    return (await this.where(table, key, value))[0];
  }
  insert<K extends TableName>(table: K, record: RecordMap[K]): Promise<RecordMap[K]> {
    return this.tx(() => this.execute((queries) => queries.insert(table, record)));
  }
  put<K extends TableName>(table: K, record: RecordMap[K]): Promise<RecordMap[K]> {
    return this.tx(() => this.execute((queries) => queries.put(table, record)));
  }
  remove(table: TableName, id: string): Promise<void> {
    return this.tx(() => this.execute((queries) => queries.remove(table, id)));
  }
  tx<T>(work: () => T | Promise<T>): Promise<T> {
    return this.session.tx(work);
  }
  async audit(
    actor: string,
    action: string,
    entity_id: string,
    reason = '',
    metadata: Record<string, unknown> = {},
  ): Promise<void> {
    await this.tx(async () => {
      await this.insert('audit', {
        id: randomUUID(),
        occurred_at: new Date().toISOString(),
        actor_id: actor,
        action,
        entity_id,
        result: auditDefinitions[action]?.failure ? 'failure' : 'success',
        reason,
        metadata,
        actor: await resolveAuditActor(this, actor),
        subject: (await resolveAuditSubject(this, action, entity_id)) ?? undefined,
      });
    });
  }
  revision(): Promise<string> {
    return this.execute((queries) => queries.revision());
  }
  sizeBytes(): Promise<number> {
    return this.execute((queries) => queries.sizeBytes());
  }
  summarizeResourceActivity(from: string, through: string) {
    return this.execute((queries) => queries.summarizeResourceActivity(from, through));
  }
  health(): Promise<void> {
    return this.execute((queries) => queries.health());
  }
  close(): Promise<void> {
    return this.session.close();
  }
}

/**
 * 按部署形态打开驱动，返回带审计能力的 `RecordStore`。
 *
 * 打开过程会就地执行未应用的迁移（PostgreSQL 用 advisory lock 串行化，
 * SQLite 用 `BEGIN IMMEDIATE`），因此首次调用可能较慢且会创建文件/表；迁移失败时异常上抛，
 * 不返回半初始化的 store。返回的 store 同时被登记为 AI 端口的会话来源，
 * `close()` 之后再使用会抛错。
 */
export async function openRecordStore(options: RecordStoreOptions): Promise<RecordStore> {
  switch (options.driver) {
    case 'sqlite':
      return new DrizzleStore(await openSqliteDriver(options.path));
    case 'postgresql':
      return new DrizzleStore(await openPostgresDriver(options));
    default:
      throw new Error('数据库驱动无效');
  }
}
