import { AsyncLocalStorage } from 'node:async_hooks';
import { DrizzleQueryError } from 'drizzle-orm';
import type { AiQueries } from '@capability-hub/ai/ports';
import type { RecordDriver, RecordQueries } from '../record-driver.js';
import { SerialExecutor } from './serial-executor.js';
import { TransactionScope } from './transaction-scope.js';

interface Queries {
  records: RecordQueries;
  ai: AiQueries;
}

/**
 * 由 `driver` 持有的会话对象，用 `AsyncLocalStorage` 传递当前事务作用域：已有事务时
 * `tx`/`execute` 复用同一连接并串行执行语句，不会再开事务，嵌套调用请复用外层会话。
 * 事务内失败会标记整个作用域，异常被吞掉也不会部分提交；事务内调用 `close` 直接抛错。
 */
export class PersistenceSession {
  private readonly context = new AsyncLocalStorage<{
    state: TransactionScope;
    queries: Queries;
    serial: SerialExecutor;
  }>();
  private closing: Promise<void> | undefined;
  constructor(readonly driver: RecordDriver) {}
  async execute<T>(work: (queries: Queries) => Promise<T>): Promise<T> {
    const scope = this.context.getStore();
    const run = async (queries: Queries) => {
      try {
        return await work(queries);
      } catch (error) {
        throw error instanceof DrizzleQueryError && error.cause ? error.cause : error;
      }
    };
    if (scope)
      return scope.state.run(() =>
        scope.serial.run(() => {
          scope.state.assertActive();
          return run(scope.queries);
        }),
      );
    if (this.closing) throw new Error('Store is closing');
    return this.driver.exclusive(() => run({ records: this.driver.queries, ai: this.driver.ai }));
  }
  async tx<T>(work: () => T | Promise<T>): Promise<T> {
    const parent = this.context.getStore();
    if (parent) return parent.state.run(work);
    if (this.closing) throw new Error('Store is closing');
    try {
      return await this.driver.exclusive(() =>
        this.driver.transaction(async (records, ai) => {
          const scope = {
            queries: { records, ai },
            state: new TransactionScope(),
            serial: new SerialExecutor(),
          };
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
      throw error instanceof DrizzleQueryError && error.cause ? error.cause : error;
    }
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
