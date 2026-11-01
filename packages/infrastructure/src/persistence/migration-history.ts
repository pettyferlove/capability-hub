import { readMigrationFiles } from 'drizzle-orm/migrator';

/**
 * 迁移账本中一行的最小视图；`created_at` 允许三种数值形态是因为不同驱动返回的
 * `timestamp`/`bigint` 列在运行时可能是字符串、number 或 bigint，比较前会统一转为 number。
 */
export type MigrationHistoryRecord = {
  hash: string;
  created_at: string | number | bigint;
};

/** 已执行记录必须是当前迁移文件的完整前缀，防止改写历史或旧程序打开新库。 */
export function validateMigrationHistory(folder: string, history: MigrationHistoryRecord[]): void {
  const migrations = readMigrationFiles({ migrationsFolder: folder });
  for (const [index, row] of history.entries()) {
    const migration = migrations[index];
    if (
      !migration ||
      migration.folderMillis !== Number(row.created_at) ||
      migration.hash !== row.hash
    )
      throw new Error('数据库迁移历史与当前文件不一致');
  }
}
