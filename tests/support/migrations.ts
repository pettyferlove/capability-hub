import { cp, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { TestContext } from 'node:test';
import type { openRecordStore } from '@capability-hub/infrastructure/store';

/** 在隔离的部署副本里追加迁移，验证真实执行器，不改工作区或当前数据库。 */
export async function migrationRuntime(context: TestContext, dialect: 'sqlite' | 'postgresql') {
  const directory = await mkdtemp(join(tmpdir(), 'hub-migration-'));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const entry = fileURLToPath(import.meta.resolve('@capability-hub/infrastructure/store'));
  const source = dirname(entry);
  await cp(source, join(directory, 'src'), { recursive: true });
  await writeFile(join(directory, 'package.json'), '{"type":"module"}');
  await symlink(
    fileURLToPath(new URL('../../packages/infrastructure/node_modules', import.meta.url)),
    join(directory, 'node_modules'),
    'dir',
  );
  const runtime = (await import(pathToFileURL(join(directory, 'src/store.ts')).href)) as {
    openRecordStore: typeof openRecordStore;
  };
  const folder = join(directory, 'src/persistence', dialect, 'migrations');
  return {
    directory,
    open: runtime.openRecordStore,
    async append(sql: string) {
      const path = join(folder, 'meta/_journal.json');
      const journal = JSON.parse(await readFile(path, 'utf8')) as {
        version: string;
        entries: {
          idx: number;
          version: string;
          when: number;
          tag: string;
          breakpoints: boolean;
        }[];
      };
      const previous = journal.entries.at(-1)!;
      const tag = `${String(previous.idx + 1).padStart(4, '0')}_test`;
      journal.entries.push({ ...previous, idx: previous.idx + 1, when: previous.when + 1, tag });
      await writeFile(join(folder, tag + '.sql'), sql);
      await writeFile(path, JSON.stringify(journal));
    },
  };
}
