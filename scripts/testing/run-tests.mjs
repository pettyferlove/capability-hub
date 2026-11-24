import { existsSync, globSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const groups = {
  default: ['unit', 'integration', 'components'],
  external: ['external'],
};
const liveSuites = {
  models: 'tests/live/ai-models.test.ts',
  evaluation: 'tests/live/resource-evaluation.test.ts',
};
const group = process.argv[2] ?? 'default';
const live = group === 'live';
const extraFiles = process.argv.slice(3);
const suite = Object.hasOwn(liveSuites, extraFiles[0]) ? extraFiles.shift() : 'models';
if (!live && !Object.hasOwn(groups, group)) throw new Error(`未知测试分组：${group}`);
const root = fileURLToPath(new URL('../../', import.meta.url));
// 拼错的套件名或不存在的文件不能退回默认套件，否则会在漏测的情况下发出付费请求。
for (const file of live ? extraFiles : [])
  if (!/\.test\.[cm]?[jt]s$/.test(file) || !existsSync(resolve(root, file)))
    throw new Error(`真实模型测试只接受 models、evaluation 或已存在的测试文件：${file}`);
const files = live
  ? [liveSuites[suite], ...extraFiles]
  : groups[group].flatMap((directory) =>
      [...globSync(`tests/${directory}/**/*.test.ts`, { cwd: root })].sort(),
    );
if (!files.length) throw new Error(`测试分组没有测试文件：${group}`);
const child = spawn(
  process.execPath,
  [
    '--conditions=development',
    ...(live ? ['--env-file-if-exists=.env'] : []),
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
