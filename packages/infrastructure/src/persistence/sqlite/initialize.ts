import { migrate } from 'drizzle-orm/sqlite-proxy/migrator';
import type { SqliteRemoteDatabase } from 'drizzle-orm/sqlite-proxy';
import type { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { validateMigrationHistory, type MigrationHistoryRecord } from '../migration-history.js';
import type { sqliteSchema } from './record-schema.js';

const migrationsFolder = fileURLToPath(new URL('./migrations', import.meta.url));

export async function initializeSqliteSchema(
  database: DatabaseSync,
  db: SqliteRemoteDatabase<typeof sqliteSchema>,
): Promise<void> {
  database.exec('BEGIN IMMEDIATE');
  try {
    const exists = database
      .prepare("SELECT 1 FROM sqlite_schema WHERE name = '__drizzle_migrations'")
      .get();
    const history = exists
      ? (database
          .prepare('SELECT hash, created_at FROM __drizzle_migrations ORDER BY created_at, id')
          .all() as unknown as MigrationHistoryRecord[])
      : [];
    validateMigrationHistory(migrationsFolder, history);
    await migrate(
      db,
      (queries) => {
        for (const query of queries) database.exec(query);
        return Promise.resolve();
      },
      { migrationsFolder },
    );
    database.exec('COMMIT');
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
}
