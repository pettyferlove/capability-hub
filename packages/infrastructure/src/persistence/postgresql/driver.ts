import { DrizzleQueryError } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { pgSchema } from './record-schema.js';
import { PgQueries } from './record-queries.js';
import { initializePostgresSchema, mutationLock } from './initialize.js';
import type { RecordDriver } from '../record-driver.js';

export interface PostgresOptions {
  driver: 'postgresql';
  url: string;
  poolSize?: number;
  onPoolError: (error: Error) => void;
}
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
    exclusive: (work) => work(),
    transaction: (work) =>
      transaction(async (tx) => {
        await tx.execute(mutationLock);
        return work(new PgQueries(tx));
      }),
    close: () => pool.end(),
  };
}
