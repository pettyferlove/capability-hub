import { auditDefinitions } from '@capability-hub/domain/audit';
import type { RecordMap, TableName } from '@capability-hub/domain/models';
import type { RecordStore } from '@capability-hub/application/ports';
import { DrizzleQueryError } from 'drizzle-orm';
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { resolveAuditActor, resolveAuditSubject } from '@capability-hub/application/audit';
import type { RecordDriver, RecordQueries } from './record-driver.js';
import { openPostgresDriver, type PostgresOptions } from './postgresql/driver.js';
import { SerialExecutor } from './transaction/serial-executor.js';
import { openSqliteDriver } from './sqlite/driver.js';
import { TransactionScope } from './transaction/transaction-scope.js';

export type RecordStoreOptions = { driver: 'sqlite'; path: string } | PostgresOptions;

function databaseError(error: unknown): unknown {
  return error instanceof DrizzleQueryError && error.cause ? error.cause : error;
}

class DrizzleStore implements RecordStore {
  readonly kind: RecordStore['kind'];
  private readonly context = new AsyncLocalStorage<{
    state: TransactionScope;
    queries: RecordQueries;
    serial: SerialExecutor;
  }>();
  private closing: Promise<void> | undefined;
  constructor(private readonly driver: RecordDriver) {
    this.kind = driver.kind;
  }

  private execute<T>(work: (queries: RecordQueries) => Promise<T>): Promise<T> {
    const scope = this.context.getStore();
    const query = async (queries: RecordQueries) => {
      try {
        return await work(queries);
      } catch (error) {
        throw databaseError(error);
      }
    };
    if (scope)
      return scope.state.run(() =>
        scope.serial.run(() => {
          scope.state.assertActive();
          return query(scope.queries);
        }),
      );
    if (this.closing) return Promise.reject(new Error('Store is closing'));
    return this.driver.exclusive(() => query(this.driver.queries));
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
  async tx<T>(work: () => T | Promise<T>): Promise<T> {
    const parent = this.context.getStore();
    if (parent) return parent.state.run(work);
    if (this.closing) throw new Error('Store is closing');
    try {
      return await this.driver.exclusive(() =>
        this.driver.transaction(async (queries) => {
          const scope = { queries, state: new TransactionScope(), serial: new SerialExecutor() };
          try {
            const result = await this.context.run(scope, work);
            scope.state.finish();
            await scope.serial.idle();
            scope.state.assertSuccessful();
            return result;
          } finally {
            scope.state.finish();
            await scope.serial.idle();
          }
        }),
      );
    } catch (error) {
      throw databaseError(error);
    }
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
    const scope = this.context.getStore();
    if (scope)
      return scope.state.run(() => {
        throw new Error('Cannot close store inside a transaction');
      });
    return (this.closing ??= this.driver.close());
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
