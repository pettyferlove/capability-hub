import { spawnSync } from 'node:child_process';
import { cp, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { isDeepStrictEqual } from 'node:util';
import { migrationFiles, validateMigrationJournal } from './lib/migration-files.ts';

const root = resolve(import.meta.dirname, '../..');
const require = createRequire(import.meta.url);
const cli = join(dirname(require.resolve('drizzle-kit')), 'bin.cjs');
const temporary = await mkdtemp(join(tmpdir(), 'hub-drizzle-check-'));
try {
  for (const dialect of ['sqlite', 'postgresql']) {
    const source = join(root, 'packages/infrastructure/src/persistence', dialect);
    const out = join(temporary, dialect);
    await validateMigrationJournal(join(source, 'migrations'));
    const before = await migrationFiles(join(source, 'migrations'));
    await cp(join(source, 'migrations'), out, { recursive: true });
    const config = join(temporary, `${dialect}.json`);
    await writeFile(
      config,
      JSON.stringify({ dialect, schema: join(source, 'schema.ts'), out: relative(root, out) }),
    );
    for (const command of ['check', 'generate']) {
      const result = spawnSync(process.execPath, [cli, command, `--config=${config}`], {
        cwd: root,
        encoding: 'utf8',
        input: '',
        timeout: 30000,
      });
      const output = result.stdout + result.stderr;
      if (
        result.error ||
        result.status !== 0 ||
        (command === 'check'
          ? !output.includes("Everything's fine")
          : !output.includes('No schema changes'))
      )
        throw new Error(`${dialect} 迁移检查失败；请生成并审查迁移。\n${output}`);
    }
    if (!isDeepStrictEqual(before, await migrationFiles(out)))
      throw new Error(`${dialect} 存在未提交的结构变更`);
    process.stdout.write(
      `${dialect}：journal 与迁移文件完整，Drizzle 快照与 Schema 一致；原生 SQL 行为由集成测试验证。\n`,
    );
  }
} finally {
  await rm(temporary, { recursive: true, force: true });
}
