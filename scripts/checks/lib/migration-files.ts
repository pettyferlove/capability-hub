import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

/** 比较完整迁移树，而不是仅比较顶层文件数量或依赖 CLI 的成功文案。 */
export async function migrationFiles(
  directory: string,
  prefix = '',
): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  for (const entry of (await readdir(join(directory, prefix), { withFileTypes: true })).sort(
    (a, b) => a.name.localeCompare(b.name),
  )) {
    const path = prefix ? prefix + '/' + entry.name : entry.name;
    if (entry.isDirectory()) Object.assign(files, await migrationFiles(directory, path));
    else if (entry.isFile())
      files[path] = createHash('sha256')
        .update(await readFile(join(directory, path)))
        .digest('hex');
    else throw new Error(`迁移目录包含非普通文件：${path}`);
  }
  return files;
}

export async function validateMigrationJournal(directory: string): Promise<void> {
  const journal: unknown = JSON.parse(
    await readFile(join(directory, 'meta/_journal.json'), 'utf8'),
  );
  if (
    !journal ||
    typeof journal !== 'object' ||
    !('entries' in journal) ||
    !Array.isArray(journal.entries) ||
    !journal.entries.length
  )
    throw new Error('迁移 journal 缺少非空 entries');
  const files = await migrationFiles(directory);
  const expected = new Set<string>(['meta/_journal.json']);
  for (const [index, entry] of (journal.entries as unknown[]).entries()) {
    if (
      !entry ||
      typeof entry !== 'object' ||
      !('idx' in entry) ||
      entry.idx !== index ||
      !('tag' in entry) ||
      typeof entry.tag !== 'string' ||
      !/^[a-zA-Z0-9_-]+$/.test(entry.tag)
    )
      throw new Error(`迁移 journal 第 ${index + 1} 条记录无效`);
    const sql = `${entry.tag}.sql`;
    const snapshot = `meta/${String(index).padStart(4, '0')}_snapshot.json`;
    if (expected.has(sql) || !Object.hasOwn(files, sql) || !Object.hasOwn(files, snapshot))
      throw new Error(`迁移文件缺失或重复：${sql} / ${snapshot}`);
    expected.add(sql);
    expected.add(snapshot);
  }
  for (const file of Object.keys(files)) {
    if ((file.endsWith('.sql') || /^meta\/.*_snapshot\.json$/.test(file)) && !expected.has(file))
      throw new Error(`迁移文件未登记在 journal：${file}`);
  }
}
