import { readMigrationFiles } from 'drizzle-orm/migrator';

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
