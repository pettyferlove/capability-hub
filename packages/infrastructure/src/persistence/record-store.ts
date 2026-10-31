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
  health(): Promise<void> {
    return this.execute((queries) => queries.health());
  }
  close(): Promise<void> {
    return this.session.close();
  }
}

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
