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
    { CAPABILITY_HUB_PUBLIC_URL: 'ftp://192.168.1.20:4100' },
    {
      CAPABILITY_HUB_DATABASE_DRIVER: 'postgresql',
      CAPABILITY_HUB_DATABASE_URL: 'https://example.test/db',
    },
  ])
    assert.throws(() => loadServerConfig({ dataDir: invalid }, environment));
  await assert.rejects(() => lstat(invalid), { code: 'ENOENT' });
});

test('CLI 仓库保留路径且允许不配置，带凭据或非下载地址在初始化前被拒绝', async (context) => {
  const dataDir = await directory(context);
  for (const value of [undefined, ''])
    assert.equal(
      loadServerConfig({ dataDir }, { CAPABILITY_HUB_CLI_REGISTRY: value }).cliRegistry,
      undefined,
    );
  for (const registry of ['http://192.168.1.20:4873', 'https://registry.example/repository/npm'])
    assert.equal(
      loadServerConfig({ dataDir }, { CAPABILITY_HUB_CLI_REGISTRY: registry }).cliRegistry,
      registry + '/',
    );
  const invalid = join(dataDir, 'invalid');
  for (const registry of [
    'not-a-url',
    'ftp://registry.example/npm/',
    'https://user:secret@registry.example/npm/',
    'https://registry.example/npm/?token=secret',
    'https://registry.example/npm/#secret',
    'http://registry.example:0/npm/',
  ])
    assert.throws(() =>
      loadServerConfig({ dataDir: invalid }, { CAPABILITY_HUB_CLI_REGISTRY: registry }),
    );
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

test('Worker 并发默认 5，可调为 1–5 的整数，超出范围时拒绝启动', async (context) => {
  const dataDir = await directory(context);
  assert.equal(loadServerConfig({ dataDir }, {}).workerConcurrency, 5);
  assert.equal(
    loadServerConfig({ dataDir }, { CAPABILITY_HUB_WORKER_CONCURRENCY: '2' }).workerConcurrency,
    2,
  );
  for (const value of ['0', '6', '2.5', 'invalid', ''])
    assert.throws(() =>
      loadServerConfig({ dataDir }, { CAPABILITY_HUB_WORKER_CONCURRENCY: value }),
    );
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

test('LDAP 仅允许本机开发使用明文连接，默认角色按内置键校验并去重', async (context) => {
  const dataDir = await directory(context);
  const env = {
    CAPABILITY_HUB_LDAP_URL: 'ldap://127.0.0.1:1389',
    CAPABILITY_HUB_LDAP_BASE_DN: 'ou=people,dc=hub,dc=test',
    CAPABILITY_HUB_LDAP_BIND_DN: 'cn=hub-reader,dc=hub,dc=test',
    CAPABILITY_HUB_LDAP_BIND_PASSWORD: 'fixture',
  };
  assert.equal(loadServerConfig({ dataDir }, {}).ldap, undefined);
  assert.deepEqual(loadServerConfig({ dataDir }, env).ldap?.defaultRoles, ['maintainer', 'reader']);
  assert.deepEqual(
    loadServerConfig({ dataDir }, { ...env, CAPABILITY_HUB_LDAP_DEFAULT_ROLES: 'reader, reader' })
      .ldap?.defaultRoles,
    ['reader'],
  );
  for (const overrides of [
    { CAPABILITY_HUB_LDAP_DEFAULT_ROLES: 'reader,missing' },
    { CAPABILITY_HUB_LDAP_BIND_PASSWORD: '' },
    { CAPABILITY_HUB_LDAP_BASE_DN: '' },
    { CAPABILITY_HUB_LDAP_URL: 'ldap://directory.example' },
    { CAPABILITY_HUB_LDAP_URL: 'https://directory.example' },
    { CAPABILITY_HUB_LDAP_URL: 'ldap://127.0.0.1:0' },
    { CAPABILITY_HUB_LDAP_URL: 'ldaps://user:pass@directory.example' },
  ])
    assert.throws(() => loadServerConfig({ dataDir }, { ...env, ...overrides }));
  const production = {
    dataDir,
    production: true,
    publicUrl: 'https://hub.example',
    secret: 'ab'.repeat(32),
  };
  assert.throws(() => loadServerConfig(production, env));
  assert.equal(
    loadServerConfig(production, { ...env, CAPABILITY_HUB_LDAP_URL: 'ldaps://directory.example' })
      .ldap?.url,
    'ldaps://directory.example',
  );
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

test('生产配置要求显式密钥和 HTTP(S) 根地址，Git 私有域名必须属于允许列表', async (context) => {
  const root = await directory(context);
  assert.throws(() =>
    loadServerConfig(
      { dataDir: join(root, 'missing-secret'), production: true, publicUrl: 'https://hub.example' },
      {},
    ),
  );
  assert.throws(() =>
    loadServerConfig(
      { dataDir: join(root, 'missing-url'), production: true, secret: 'ab'.repeat(32) },
      {},
    ),
  );
  for (const origin of ['http://192.168.1.20:4100', 'https://hub.example']) {
    const config = loadServerConfig(
      { dataDir: root },
      {
        NODE_ENV: 'production',
        CAPABILITY_HUB_INSTANCE_SECRET: 'ab'.repeat(32),
        CAPABILITY_HUB_PUBLIC_URL: origin + '/',
      },
    );
    assert.equal(config.publicUrl, origin);
  }
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
