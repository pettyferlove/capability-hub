import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const cli = fileURLToPath(new URL('bin/eslint.js', import.meta.resolve('eslint/package.json')));
const batches = [
  ['apps/web'],
  ['apps/server'],
  ['apps/cli'],
  ['packages'],
  ['scripts', 'bin', 'tests'],
];

for (const directories of batches) {
  const result = spawnSync(process.execPath, [cli, ...directories, ...process.argv.slice(2)], {
    cwd: root,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.exitCode = result.status ?? 1;
    break;
  }
}
