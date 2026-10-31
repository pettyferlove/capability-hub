import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { fileURLToPath } from 'node:url';
import { validateMigrationHistory, type MigrationHistoryRecord } from '../migration-history.js';
import type { pgSchema } from './record-schema.js';

const migrationsFolder = fileURLToPath(new URL('./migrations', import.meta.url));
export const mutationLock = sql`select pg_advisory_xact_lock(716648321094::bigint)`;

export async function initializePostgresSchema(tx: NodePgDatabase<typeof pgSchema>): Promise<void> {
  const result = await tx.execute<{ name: string | null }>(
    sql`select to_regclass('drizzle.__drizzle_migrations')::text as name`,
  );
  const history = result.rows[0].name
    ? (
        await tx.execute<MigrationHistoryRecord>(
          sql`select hash, created_at from drizzle.__drizzle_migrations order by created_at, id`,
        )
      ).rows
    : [];
  validateMigrationHistory(migrationsFolder, history);
  await migrate(tx, { migrationsFolder });
}
