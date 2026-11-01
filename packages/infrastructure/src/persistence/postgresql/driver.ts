import { PgAiQueries } from './ai-queries.js';
import { DrizzleQueryError } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { pgSchema } from './record-schema.js';
import { PgQueries } from './record-queries.js';
import { initializePostgresSchema, mutationLock } from './initialize.js';
import type { RecordDriver } from '../record-driver.js';

/** PostgreSQL 驱动的连接参数；`onPoolError` 必须自行记录，否则空闲连接的异步错误会丢失。 */
export interface PostgresOptions {
  driver: 'postgresql';
  url: string;
  /** 连接池上限，默认 10。 */
  poolSize?: number;
  /** 池级错误回调：空闲连接断开、服务端主动结束会话等都会走到这里。 */
  onPoolError: (error: Error) => void;
}

/**
 * 打开 PostgreSQL 驱动并就地完成迁移，返回 {@link RecordDriver}。
 *
 * 超时与连接：建连 5 秒、单条语句 15 秒、事务空闲 30 秒即被服务端回收；池上限取 `poolSize ?? 10`，
 * 池耗尽会让调用方排队而不是快速失败。启动阶段先取事务级 advisory lock
 * （{@link mutationLock}）再跑迁移，多实例同时启动时只有一个实例真正执行迁移。
 *
 * 事务隔离：每个事务从池里独占一个 client，出错后若错误来自 begin/commit/rollback 本身，
 * 说明连接状态不可信，该 client 会被直接丢弃而不是归还池。初始化失败时关闭整个池后再抛出，
 * 不会留下半初始化的驱动。
 */
export async function openPostgresDriver(options: PostgresOptions): Promise<RecordDriver> {
  const pool = new Pool({
    connectionString: options.url,
    max: options.poolSize ?? 10,
    connectionTimeoutMillis: 5000,
    statement_timeout: 15000,
    idle_in_transaction_session_timeout: 30000,
  });
  pool.on('error', options.onPoolError);
  const db = drizzle({ client: pool, schema: pgSchema, logger: false });
  const transaction = async <T>(
    work: (session: NodePgDatabase<typeof pgSchema>) => Promise<T>,
  ): Promise<T> => {
    const client = await pool.connect();
    let discard = false;
    const onError = (error: Error) => {
      discard = true;
      options.onPoolError(error);
    };
    client.on('error', onError);
    try {
      const scoped = drizzle({ client, schema: pgSchema, logger: false });
      return await scoped.transaction(work);
    } catch (error) {
      discard ||=
        error instanceof DrizzleQueryError && /^(begin|commit|rollback)\b/i.test(error.query);
      throw error;
    } finally {
      client.off('error', onError);
      client.release(discard);
    }
  };
  try {
    await transaction(async (tx) => {
      await tx.execute(mutationLock);
      await initializePostgresSchema(tx);
    });
  } catch (error) {
    await pool.end();
    throw error;
  }
  return {
    kind: 'postgresql',
    queries: new PgQueries(db),
    ai: new PgAiQueries(db),
    exclusive: (work) => work(),
    transaction: (work) =>
      transaction(async (tx) => {
        await tx.execute(mutationLock);
        return work(new PgQueries(tx), new PgAiQueries(tx));
      }),
    close: () => pool.end(),
  };
}
