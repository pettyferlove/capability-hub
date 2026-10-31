import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chmod, lstat, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadServerConfig } from '@capability-hub/server/config';

async function directory(context: import('node:test').TestContext) {
  const root = await mkdtemp(join(tmpdir(), 'hub-config-test-'));
  context.after(async () => await rm(root, { recursive: true, force: true }));
  return root;
}

test('配置错误在创建数据目录之前报错，校验不会产生半初始化实例', async (context) => {
  const root = await directory(context);
  const invalid = join(root, 'invalid');
  for (const environment of [
    { PORT: '0' },
    { CAPABILITY_HUB_DATABASE_DRIVER: 'unknown' },
    { CAPABILITY_HUB_WORKER: 'invalid' },
    { CAPABILITY_HUB_PUBLIC_URL: 'https://user:secret@example.test/path' },
    {
      CAPABILITY_HUB_DATABASE_DRIVER: 'postgresql',
      CAPABILITY_HUB_DATABASE_URL: 'https://example.test/db',
    },
  ])
    assert.throws(() => loadServerConfig({ dataDir: invalid }, environment));
  await assert.rejects(() => lstat(invalid), { code: 'ENOENT' });
});

test('布尔环境变量使用 true/false，未设置时默认启用，显式配置优先', async (context) => {
  const dataDir = await directory(context);
  const defaults = loadServerConfig({ dataDir }, {});
  assert.equal(defaults.worker, true);
  assert.equal(defaults.requestLogging, true);
  for (const enabled of [true, false]) {
    const environment = {
      CAPABILITY_HUB_WORKER: String(enabled),
      CAPABILITY_HUB_REQUEST_LOGS: String(!enabled),
    };
    const config = loadServerConfig({ dataDir }, environment);
    assert.equal(config.worker, enabled);
    assert.equal(config.requestLogging, !enabled);
    const overridden = loadServerConfig(
      { dataDir, worker: !enabled, requestLogging: enabled },
      environment,
    );
    assert.equal(overridden.worker, !enabled);
    assert.equal(overridden.requestLogging, enabled);
  }
});

test('非法布尔环境变量在创建实例目录前报错并指出变量名', async (context) => {
  const root = await directory(context);
  const dataDir = join(root, 'invalid');
  for (const name of ['CAPABILITY_HUB_WORKER', 'CAPABILITY_HUB_REQUEST_LOGS']) {
    for (const value of ['0', '1', '', 'TRUE', 'FALSE', 'yes', 'no', ' true ']) {
      assert.throws(() => loadServerConfig({ dataDir }, { [name]: value }), {
        message: name + ' 必须为 true 或 false',
      });
    }
  }
  await assert.rejects(() => lstat(dataDir), { code: 'ENOENT' });
});

test('开发实例创建私有密钥并在再次打开时复用，显式配置的密钥不会落盘', async (context) => {
  const root = await directory(context);
  const first = loadServerConfig({ dataDir: join(root, 'local') }, {});
  assert.match(first.secret, /^[a-f0-9]{64}$/);
  const key = join(first.dataDir, 'instance.key');
  assert.equal((await lstat(key)).mode & 0o077, 0);
  assert.equal(await readFile(key, 'utf8'), first.secret);
  assert.equal(loadServerConfig({ dataDir: first.dataDir }, {}).secret, first.secret);
  const explicit = loadServerConfig(
    { dataDir: join(root, 'configured'), secret: 'ab'.repeat(32) },
    {},
  );
  assert.equal(explicit.secret, 'ab'.repeat(32));
  await assert.rejects(() => lstat(join(explicit.dataDir, 'instance.key')), { code: 'ENOENT' });
});

test('实例密钥拒绝符号链接、公开权限和损坏内容，不能静默替换异常密钥', async (context) => {
  const root = await directory(context);
  const outside = join(root, 'outside-key');
  const key = join(root, 'instance.key');
  await writeFile(outside, 'cd'.repeat(32), { mode: 0o600 });
  await symlink(outside, key);
  assert.throws(() => loadServerConfig({ dataDir: root }, {}));
  await rm(key);
  await writeFile(key, 'ab'.repeat(32), { mode: 0o644 });
  assert.throws(() => loadServerConfig({ dataDir: root }, {}));
  await chmod(key, 0o600);
  await writeFile(key, 'broken-key');
  assert.throws(() => loadServerConfig({ dataDir: root }, {}));
  assert.equal(await readFile(key, 'utf8'), 'broken-key');
});

test('生产配置要求显式密钥和 HTTPS，Git 私有域名必须属于允许列表', async (context) => {
  const root = await directory(context);
  assert.throws(() =>
    loadServerConfig(
      { dataDir: join(root, 'missing-secret'), production: true, publicUrl: 'https://hub.example' },
      {},
    ),
  );
  assert.throws(() =>
    loadServerConfig(
      { dataDir: join(root, 'no-tls'), production: true, secret: 'ab'.repeat(32) },
      {},
    ),
  );
  assert.throws(() =>
    loadServerConfig(
      {
        dataDir: root,
        secret: 'ab'.repeat(32),
        gitHosts: ['git.example'],
        privateGitHosts: ['other.example'],
      },
      {},
    ),
  );
  const config = loadServerConfig(
    {
      dataDir: root,
      secret: 'ab'.repeat(32),
      gitHosts: [' GIT.EXAMPLE ', 'git.example'],
      privateGitHosts: ['git.example'],
    },
    {},
  );
  assert.deepEqual(config.gitHosts, ['git.example']);
});
