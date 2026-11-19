import { execFileSync, spawnSync } from 'node:child_process';
import { isAbsolute } from 'node:path';
import cliPackage from '../../apps/cli/package.json' with { type: 'json' };

const target = process.env.CAPABILITY_HUB_CLI_TEST_NODE;
if (!target || !isAbsolute(target))
  throw new Error('CAPABILITY_HUB_CLI_TEST_NODE 必须指向 Node.js 可执行文件的绝对路径');
const version = execFileSync(target, ['-p', 'process.versions.node'], { encoding: 'utf8' }).trim();
const minimum = cliPackage.engines.node.slice(2);
const versionParts = version.split('.').map(Number);
const minimumParts = minimum.split('.').map(Number);
const different = minimumParts.findIndex((part, i) => part !== versionParts[i]);
if (
  versionParts.length !== 3 ||
  !versionParts.every(Number.isInteger) ||
  (different !== -1 && versionParts[different] < minimumParts[different])
)
  throw new Error(`CLI 需要 Node.js ${minimum} 及以上，目标版本为 ${version}`);

const pnpm = process.env.npm_execpath;
if (!pnpm) throw new Error('请通过 pnpm test:cli-runtime 执行');

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

console.log(`工作区 Node.js ${process.version}；CLI Node.js v${version} (${target})`);
// 独立安装的 pnpm 是原生可执行文件，只有 JS 入口需要由当前 Node 启动。
const [pnpmCommand, ...pnpmEntry] = /\.[cm]?js$/.test(pnpm) ? [process.execPath, pnpm] : [pnpm];
run(pnpmCommand, [...pnpmEntry, '--filter', '@capability-hub/cli', 'build']);
const bundle = 'apps/cli/dist/main.js';
run(target, [bundle, '-V']);
run(target, [bundle, '--help']);
run(target, [
  bundle,
  'hub-config',
  '--url',
  'https://hub.example.test',
  '--client',
  'opencode',
  '--scope',
  'project',
  '--no-interactive',
]);
run(process.execPath, [
  '--conditions=development',
  '--import',
  './scripts/testing/register-test-runtime.mjs',
  '--test',
  'tests/integration/cli.test.ts',
  'tests/integration/connection-assistant.test.ts',
]);
