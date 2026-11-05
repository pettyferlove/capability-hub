import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawn } from 'node:child_process';
import { request as httpRequest } from 'node:http';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import {
  readFile,
  stat,
  realpath,
  writeFile,
  readdir,
  symlink,
  mkdir,
  utimes,
} from 'node:fs/promises';
import { serveTestHub } from '../support/server.js';
import { signIn } from '../support/http.js';
import { publishSkill } from '../support/application.js';
import {
  prepareConnectionConfig,
  writeConnectionConfig,
} from '../../apps/cli/src/connection-config.js';
import { withFileLock } from '../../apps/cli/src/file-lock.js';
import { connectAgent } from '../../apps/cli/src/connection.js';
import { connectionFile, connectionToken } from '../../apps/cli/src/connection-auth.js';
import { loadPrivateJson, savePrivateJson } from '../../apps/cli/src/private-json.js';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

// 仅使用隔离测试实例的会话，模拟授权协议响应，不访问用户浏览器或凭据。
test('接入助手子进程完成浏览器授权回调、私有保存、合并配置、检索验证与 stdio 桥接', async (context) => {
  const fixture = await serveTestHub(context);
  await publishSkill(fixture);
  const directory = join(await realpath(fixture.directory), 'assistant');
  const target = join(await realpath(fixture.directory), 'mcp.json');
  await writeFile(
    target,
    '{\n // keep comment\n "mcpServers": {"other": {"command": "other"}}, "setting": true\n}\n',
  );
  const child = spawn(
    process.execPath,
    [
      '--conditions=development',
      '--import',
      'tsx',
      'bin/capability-hub.mjs',
      'connect',
      '--url',
      fixture.origin,
      '--client',
      'cursor',
      '--config-dir',
      directory,
      '--config-file',
      target,
      '--no-browser',
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );
  context.after(() => {
    child.kill();
  });
  let stdout = '',
    stderr = '';
  child.stdout.on('data', (data: Buffer) => {
    stdout += data.toString();
  });
  const authorizationUrl = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(stderr || '助手未发起授权')), 15000);
    child.once('error', reject);
    child.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
      const match = stderr.match(/http:\/\/127\.0\.0\.1:\d+\/oauth\/authorize\?[^\s]+/);
      if (match) {
        clearTimeout(timer);
        resolve(match[0]);
      }
    });
  });
  const exit = new Promise<number | null>((resolve) => child.once('exit', resolve));
  const started = await fetch(authorizationUrl, { redirect: 'manual' });
  const requestId = new URL(started.headers.get('location')!, fixture.origin).searchParams.get(
    'authorization',
  );
  const browser = await signIn(fixture);
  const decision = await browser
    .post('/api/connections/authorize/' + requestId)
    .send({ allow: true })
    .expect(200);
  const callback = new URL(decision.body.redirect_uri as string);
  const malformed = await new Promise<number | undefined>((resolve, reject) => {
    const request = httpRequest(
      { hostname: callback.hostname, port: callback.port, path: 'http://[', method: 'GET' },
      (response) => {
        response.resume();
        resolve(response.statusCode);
      },
    );
    request.on('error', reject);
    request.end();
  });
  assert.equal(malformed, 400);
  const duplicate = new URL(callback);
  duplicate.searchParams.append('state', 'unexpected');
  assert.equal((await fetch(duplicate)).status, 400);
  const wrongIssuer = new URL(callback);
  wrongIssuer.searchParams.set('iss', 'https://other.example');
  assert.equal((await fetch(wrongIssuer)).status, 400);
  assert.equal((await fetch(callback)).status, 200);
  assert.equal(await exit, 0, stderr);
  assert.equal(stdout, '');
  assert.match(stderr, /检索成功/);
  const text = await readFile(target, 'utf8');
  assert(text.includes('// keep comment'));
  assert(text.includes('"other"'));
  assert(text.includes('bridge'));
  const path = connectionFile(directory, fixture.origin, 'cursor');
  const saved = (await loadPrivateJson(path)) as {
    client_id: string;
    access_token: string;
    refresh_token: string;
    expires_at: number;
  };
  assert.equal((await stat(path)).mode & 0o077, 0);
  for (const secret of [saved.access_token, saved.refresh_token])
    assert.equal((stdout + stderr + text).includes(secret), false);
  const backupDirectory = join(directory, 'config-backups');
  const backups = await readdir(backupDirectory);
  assert.equal(backups.length, 1);
  assert.equal((await stat(join(backupDirectory, backups[0]))).mode & 0o077, 0);
  assert.equal((await stat(backupDirectory)).mode & 0o077, 0);
  assert.equal(
    (await readdir(await realpath(fixture.directory))).some((name) =>
      name.includes('.hub-backup-'),
    ),
    false,
  );
  await savePrivateJson(path, { ...saved, expires_at: 0 });
  const concurrent = await Promise.all([
    connectionToken(path, fixture.origin),
    connectionToken(path, fixture.origin),
  ]);
  assert.equal(concurrent[0], concurrent[1]);
  assert.notEqual(concurrent[0], saved.access_token);
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [
      '--conditions=development',
      '--import',
      'tsx',
      'bin/capability-hub.mjs',
      'bridge',
      '--url',
      fixture.origin,
      '--client',
      'cursor',
      '--config-dir',
      directory,
    ],
    stderr: 'pipe',
  });
  const client = new Client({ name: 'assistant-test', version: '1.0.0' });
  try {
    await client.connect(transport);
    assert(client.getInstructions()?.includes('/connect?permission=contribute'));
    assert(client.getInstructions()?.includes('不要索取访问令牌'));
    assert((await client.listTools()).tools.some((tool) => tool.name === 'search_skills'));
    const result = await client.callTool({
      name: 'search_skills',
      arguments: { query: 'sample', limit: 1 },
    });
    assert.equal(result.isError, undefined);
    assert(JSON.stringify(result).includes('sample-skill'));
    const pinned = await client.callTool({
      name: 'get_asset_version',
      arguments: { asset_id: 'sample-skill', version_label: '1.0.0' },
    });
    assert.equal(pinned.isError, undefined);
    assert(
      pinned.structuredContent &&
        typeof pinned.structuredContent === 'object' &&
        'slug' in pinned.structuredContent,
    );
    assert.equal(pinned.structuredContent.slug, 'sample-skill');
    const refreshed = (await loadPrivateJson(path)) as Record<string, unknown>;
    await savePrivateJson(path, { ...refreshed, client_id: 'another-authorization' });
    await assert.rejects(connectionToken(path, fixture.origin, saved.client_id), /重新加载/);
    const changed = await client.callTool({
      name: 'search_skills',
      arguments: { query: 'sample', limit: 1 },
    });
    assert.equal(changed.isError, true);
    assert(JSON.stringify(changed).includes('重新加载'));
    await savePrivateJson(path, refreshed);
    const connections = await fixture.hub.oauth.list(fixture.admin.id);
    await fixture.hub.oauth.disconnect(fixture.admin.id, connections[0].id);
    const revoked = await client.callTool({
      name: 'search_skills',
      arguments: { query: 'sample', limit: 1 },
    });
    assert.equal(revoked.isError, true);
  } finally {
    await client.close();
  }
});

test('助手保留 TOML 设置、拒绝冲突和并发修改，配置和凭据均不能穿过符号链接', async (context) => {
  const fixture = await serveTestHub(context);
  const directory = await realpath(fixture.directory);
  const target = join(directory, 'config.toml');
  const original = '# keep\nmodel = "test"\n[mcp_servers.other]\ncommand = "other"\n';
  await writeFile(target, original);
  const options = {
    client: 'codex' as const,
    scope: 'project' as const,
    url: fixture.origin,
    directory,
    configFile: target,
  };
  const prepared = await prepareConnectionConfig(options);
  await writeFile(target, original + '# concurrent\n');
  await assert.rejects(writeConnectionConfig(prepared), /其他程序修改/);
  await writeConnectionConfig(await prepareConnectionConfig(options));
  const text = await readFile(target, 'utf8');
  assert(text.startsWith(original));
  assert(text.includes('[mcp_servers."capability-hub"]'));
  await assert.rejects(
    prepareConnectionConfig({ ...options, url: 'https://other.example' }),
    /已有 capability-hub/,
  );
  const link = join(directory, 'link.toml');
  await symlink(target, link);
  await assert.rejects(prepareConnectionConfig({ ...options, configFile: link }));
  await assert.rejects(savePrivateJson(link, {}), /链接/);
});

test('助手恢复崩溃锁，并发配置写入只有一个成功且备份保持原文', async (context) => {
  const fixture = await serveTestHub(context);
  const directory = await realpath(fixture.directory);
  const path = join(directory, 'stale');
  await mkdir(path + '.lock');
  const old = new Date(Date.now() - 120000);
  await utimes(path + '.lock', old, old);
  assert.equal(await withFileLock(path, async () => 'recovered'), 'recovered');
  const target = join(directory, 'mcp.json');
  const original = '{"mcpServers":{"other":{"command":"existing"}}}';
  await writeFile(target, original);
  const options = {
    client: 'cursor' as const,
    scope: 'project' as const,
    url: fixture.origin,
    directory,
    configFile: target,
  };
  const prepared = await prepareConnectionConfig(options);
  const results = await Promise.allSettled([
    writeConnectionConfig(prepared),
    writeConnectionConfig(prepared),
  ]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  const backups = await readdir(join(directory, 'config-backups'));
  assert.equal(backups.length, 1);
  assert.equal(await readFile(join(directory, 'config-backups', backups[0]), 'utf8'), original);
  const unchanged = await prepareConnectionConfig(options);
  await writeFile(target, original);
  await assert.rejects(writeConnectionConfig(unchanged), /其他程序修改/);
});

test('助手拒绝重复 JSON 字段和空值冲突，能够合并 TOML 内联表', async (context) => {
  const fixture = await serveTestHub(context);
  const directory = await realpath(fixture.directory);
  const target = join(directory, 'config.json');
  const options = {
    client: 'cursor' as const,
    scope: 'project' as const,
    url: fixture.origin,
    directory,
    configFile: target,
  };
  await writeFile(target, '{"mcpServers":{}, "mcpServers":{}}');
  await assert.rejects(prepareConnectionConfig(options), /重复字段/);
  await writeFile(target, '{"mcpServers":{"capability-hub":null}}');
  await assert.rejects(prepareConnectionConfig(options), /已有 capability-hub/);
  const toml = join(directory, 'config.toml');
  await writeFile(toml, 'mcp_servers = { other = { command = "existing" } }');
  await writeConnectionConfig(
    await prepareConnectionConfig({ ...options, client: 'codex', configFile: toml }),
  );
  const text = await readFile(toml, 'utf8');
  assert(text.includes('existing'));
  assert(text.includes('capability-hub'));
});

test('网络异常保留原凭据和配置，不发起新授权或覆盖文件', async (context) => {
  const fixture = await serveTestHub(context);
  const directory = await realpath(fixture.directory);
  const path = connectionFile(directory, fixture.origin, 'cursor');
  const saved = {
    url: fixture.origin,
    client_id: 'old-client',
    access_token: 'old-access',
    refresh_token: 'old-refresh',
    expires_at: 0,
    scope: 'hub:read',
  };
  await savePrivateJson(path, saved);
  const calls: string[] = [];
  context.mock.method(globalThis, 'fetch', (input: string) => {
    calls.push(String(input));
    return Promise.resolve(Response.json({ error: 'temporarily_unavailable' }, { status: 503 }));
  });
  const target = join(directory, 'mcp.json');
  await writeFile(target, '{}');
  await assert.rejects(
    connectAgent({
      client: 'cursor',
      scope: 'project',
      url: fixture.origin,
      directory,
      configFile: target,
      contribute: false,
      noBrowser: true,
    }),
    /稍后重试/,
  );
  assert.deepEqual(await loadPrivateJson(path), saved);
  assert.equal(await readFile(target, 'utf8'), '{}');
  assert.deepEqual(calls, [fixture.origin + '/oauth/token']);
});

test('追加权限未获批准或授权期间配置冲突时，保留原连接并撤销新授权', async (context) => {
  for (const conflict of [false, true]) {
    const fixture = await serveTestHub(context);
    const directory = await realpath(fixture.directory);
    const path = connectionFile(directory, fixture.origin, 'cursor');
    const verifier = 'v'.repeat(43);
    const registered = await fixture.hub.oauth.register({
      redirect_uris: ['http://127.0.0.1/callback'],
    });
    const request = await fixture.hub.oauth.begin({
      client_id: registered.client_id,
      redirect_uri: 'http://127.0.0.1/callback',
      response_type: 'code',
      code_challenge_method: 'S256',
      code_challenge: createHash('sha256').update(verifier).digest('base64url'),
      resource: fixture.origin + '/mcp',
    });
    const decision = await fixture.hub.oauth.decide(fixture.admin, request, true, false);
    const tokens = await fixture.hub.oauth.exchange({
      client_id: registered.client_id,
      grant_type: 'authorization_code',
      redirect_uri: 'http://127.0.0.1/callback',
      code: new URL(decision.redirect_uri).searchParams.get('code'),
      code_verifier: verifier,
      resource: fixture.origin + '/mcp',
    });
    const previous = {
      url: fixture.origin,
      client_id: registered.client_id,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      scope: tokens.scope,
      expires_at: Date.now() + tokens.expires_in * 1000,
    };
    await savePrivateJson(path, previous);
    const target = join(directory, 'mcp.json');
    await writeFile(target, '{}');
    let capture: (value: string) => void = () => {};
    const authorization = new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('未发起授权')), 15000);
      capture = (value) => {
        const url = value.match(/http:\/\/127\.0\.0\.1:\d+\/oauth\/authorize\?[^\s]+/);
        if (url) {
          clearTimeout(timer);
          resolve(url[0]);
        }
      };
    });
    const output = context.mock.method(process.stderr, 'write', (value: string | Uint8Array) => {
      capture(String(value));
      return true;
    });
    try {
      const completion = assert.rejects(
        connectAgent({
          client: 'cursor',
          scope: 'project',
          url: fixture.origin,
          directory,
          configFile: target,
          contribute: true,
          noBrowser: true,
        }),
        conflict ? /其他程序修改/ : /只授予了读取权限/,
      );
      const started = await fetch(await authorization, { redirect: 'manual' });
      const id = new URL(started.headers.get('location')!, fixture.origin).searchParams.get(
        'authorization',
      )!;
      const approved = await fixture.hub.oauth.decide(fixture.admin, id, true, conflict);
      if (conflict) await writeFile(target, '{"concurrent":true}');
      assert.equal((await fetch(approved.redirect_uri)).status, 200);
      await completion;
    } finally {
      output.mock.restore();
    }
    assert.deepEqual(await loadPrivateJson(path), previous);
    assert.equal(await readFile(target, 'utf8'), conflict ? '{"concurrent":true}' : '{}');
    const grants = await fixture.hub.oauth.list(fixture.admin.id);
    assert.equal(grants.length, 2);
    assert.equal(grants.filter((grant) => grant.revoked_at === null).length, 1);
    assert(await fixture.hub.oauth.authenticate(previous.access_token));
  }
});
