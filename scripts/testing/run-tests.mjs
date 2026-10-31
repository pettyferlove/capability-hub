import { globSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const groups = {
  default: ['unit', 'integration', 'components'],
  external: ['external'],
};
const group = process.argv[2] ?? 'default';
if (!Object.hasOwn(groups, group)) throw new Error(`未知测试分组：${group}`);
const root = fileURLToPath(new URL('../../', import.meta.url));
const files = groups[group].flatMap((directory) =>
  [...globSync(`tests/${directory}/**/*.test.ts`, { cwd: root })].sort(),
);
if (!files.length) throw new Error(`测试分组没有测试文件：${group}`);
const child = spawn(
  process.execPath,
  [
    '--conditions=development',
    '--import',
    './scripts/testing/register-test-runtime.mjs',
    '--test',
    '--test-concurrency=4',
    ...files,
  ],
  { cwd: root, stdio: 'inherit' },
);
child.once('error', (error) => {
  throw error;
});
child.once('exit', (code) => {
  process.exitCode = code ?? 1;
});
