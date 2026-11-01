import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { fileURLToPath } from 'node:url';
import { validateMigrationHistory, type MigrationHistoryRecord } from '../migration-history.js';
import type { pgSchema } from './record-schema.js';

const migrationsFolder = fileURLToPath(new URL('./migrations', import.meta.url));

/**
 * 迁移用的固定 advisory lock 键。取事务级锁，因此随事务结束自动释放；
 * 所有实例用同一常量，保证启动时迁移串行执行。
 */
export const mutationLock = sql`select pg_advisory_xact_lock(716648321094::bigint)`;

/**
 * 在给定事务内校验迁移历史并执行未应用的迁移。
 *
 * 迁移账本在 `drizzle.__drizzle_migrations` schema 中（先 `to_regclass` 探测，
 * 避免首次启动时报错）。已执行记录必须是当前迁移文件的完整前缀，否则抛错而不是继续执行
 * （防止改写历史或旧程序打开新库）。调用方需已持有 {@link mutationLock} 并在事务中调用——
 * 迁移与加锁必须同属一个事务才有效。
 */
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
