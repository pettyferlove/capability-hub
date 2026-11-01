import { migrate } from 'drizzle-orm/sqlite-proxy/migrator';
import type { SqliteRemoteDatabase } from 'drizzle-orm/sqlite-proxy';
import type { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { validateMigrationHistory, type MigrationHistoryRecord } from '../migration-history.js';
import type { sqliteSchema } from './record-schema.js';

const migrationsFolder = fileURLToPath(new URL('./migrations', import.meta.url));

/**
 * 在一个 `BEGIN IMMEDIATE` 事务内校验迁移历史并执行未应用的迁移。
 *
 * `IMMEDIATE` 一上来就拿写锁，避免两个进程同时看到「尚未迁移」而重复执行；
 * 迁移账本读自 `sqlite_schema`/`__drizzle_migrations`（首次启动时不存在，按空历史处理），
 * 历史必须是当前迁移文件的完整前缀，否则抛错而不是继续。任一步失败都会 `ROLLBACK`，
 * 因此不会留下半迁移的库；SQLite 的 DDL 与 DML 同属该事务。
 * 返回前必须已 `COMMIT`，调用方随后才能对外提供服务。
 */
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
