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
