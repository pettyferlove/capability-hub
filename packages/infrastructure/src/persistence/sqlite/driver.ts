import { SqliteAiQueries } from './ai-queries.js';
import { drizzle } from 'drizzle-orm/sqlite-proxy';
import { chmodSync, existsSync, mkdirSync, realpathSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { sqliteSchema } from './record-schema.js';
import { SqliteQueries } from './record-queries.js';
import type { RecordDriver } from '../record-driver.js';
import { initializeSqliteSchema } from './initialize.js';
import { acquireSqliteExecutor } from './executor-pool.js';

function input(value: unknown): SQLInputValue {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'bigint' ||
    value instanceof Uint8Array
  )
    return value;
  throw new TypeError('Unsupported SQLite parameter');
}
/**
 * 打开（必要时创建）SQLite 数据库并就地完成迁移，返回 {@link RecordDriver}。
 *
 * 路径处理：目录按 0700 创建，文件路径先 `realpath` 归一，避免同一库经由符号链接被打开两次而
 * 得到两套连接；归一后的路径作为执行器池的键，因此同一进程内对同一库只有一条串行队列。
 * 权限固定为 0600。连接参数为 `foreign_keys=ON`、`journal_mode=WAL`、`busy_timeout=5000`。
 *
 * 副作用与生命周期：文件在首次打开时被创建；初始化失败会关闭连接并归还在池中的引用。
 * `close()` 在串行执行器内关闭连接后再释放引用计数，因此不会与正在执行的语句交错。
 */
export async function openSqliteDriver(path: string): Promise<RecordDriver> {
  const absolute = resolve(path);
  mkdirSync(dirname(absolute), { recursive: true, mode: 0o700 });
  const canonical = existsSync(absolute)
    ? realpathSync(absolute)
    : join(realpathSync(dirname(absolute)), basename(absolute));
  const lease = acquireSqliteExecutor(canonical);
  try {
    return await lease.executor.run(async () => {
      const client = new DatabaseSync(canonical);
      try {
        chmodSync(canonical, 0o600);
        client.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
        const db = drizzle(
          (statement: string, parameters: unknown[], method) => {
            const query = client.prepare(statement);
            const values = parameters.map(input);
            if (method === 'run') {
              query.run(...values);
              return Promise.resolve({ rows: [] });
            }
            query.setReturnArrays(true);
            const rows = query.all(...values).map((row) => Object.values(row));
            return Promise.resolve({ rows: method === 'get' ? (rows[0] ?? []) : rows });
          },
          { schema: sqliteSchema, logger: false },
        );
        await initializeSqliteSchema(client, db);
        return {
          kind: 'sqlite',
          queries: new SqliteQueries(db),
          ai: new SqliteAiQueries(db),
          exclusive: (work) => lease.executor.run(work),
          transaction: (work) =>
            db.transaction((tx) => work(new SqliteQueries(tx), new SqliteAiQueries(tx)), {
              behavior: 'immediate',
            }),
          close: () =>
            lease.executor.run(() => {
              try {
                client.close();
              } finally {
                lease.release();
              }
            }),
        } satisfies RecordDriver;
      } catch (error) {
        client.close();
        throw error;
      }
    });
  } catch (error) {
    lease.release();
    throw error;
  }
}
