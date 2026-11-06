import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  hubUrl,
  loadCredentials,
  resolveConsumerCredentials,
  saveCredentials,
} from '../../apps/cli/src/credentials.js';

test('凭据原子替换收紧权限，读取拒绝公开文件及祖先符号链接', async (context) => {
  const root = await mkdtemp(join(await realpath(tmpdir()), 'hub-credentials-'));
  context.after(() => rm(root, { recursive: true, force: true }));
  const path = join(root, 'config/credentials/auth.json');
  const value = { url: 'https://hub.example.test', token: 'hub_token_for_test' };
  await saveCredentials(path, value);
  assert.deepEqual(await loadCredentials(path), value);
  if (process.platform !== 'win32') {
    assert.equal((await stat(path)).mode & 0o777, 0o600);
    await chmod(path, 0o644);
    await assert.rejects(() => loadCredentials(path), /私有普通文件/);
  }
  await saveCredentials(path, value);
  assert.deepEqual(await loadCredentials(path), value);
  if (process.platform !== 'win32') assert.equal((await stat(path)).mode & 0o777, 0o600);
  await mkdir(join(root, 'outside/child'), { recursive: true });
  await symlink(
    join(root, 'outside'),
    join(root, 'link'),
    process.platform === 'win32' ? 'junction' : 'dir',
  );
  await assert.rejects(
    () => saveCredentials(join(root, 'link/child/auth.json'), value),
    /符号链接/,
  );
  await assert.rejects(() => readFile(join(root, 'outside/child/auth.json')), { code: 'ENOENT' });
  await saveCredentials(join(root, 'outside/child/auth.json'), value);
  await assert.rejects(() => loadCredentials(join(root, 'link/child/auth.json')), /符号链接/);
  await writeFile(path, 'x'.repeat(16385), { mode: 0o600 });
  await assert.rejects(() => loadCredentials(path), /16 KiB/);
});

test('Windows 凭据读取接受可写及只读文件的模拟权限位，仍拒绝链接和超大文件', async (context) => {
  const root = await mkdtemp(join(await realpath(tmpdir()), 'hub-windows-credentials-'));
  context.after(() => rm(root, { recursive: true, force: true }));
  const path = join(root, 'auth.json');
  const value = { url: 'https://hub.example.test', token: 'hub_windows_token_for_test' };
  await saveCredentials(path, value);
  const link = join(root, 'link.json');
  await symlink(path, link, 'file');
  const platform = Object.getOwnPropertyDescriptor(process, 'platform')!;
  Object.defineProperty(process, 'platform', { value: 'win32' });
  context.after(() => Object.defineProperty(process, 'platform', platform));
  for (const mode of [0o666, 0o444]) {
    await chmod(path, mode);
    assert.deepEqual(await loadCredentials(path), value);
  }
  await assert.rejects(() => loadCredentials(link), /链接/);
  await assert.rejects(() => loadCredentials(root), /普通文件/);
  await chmod(path, 0o600);
  await writeFile(path, 'x'.repeat(16385));
  await assert.rejects(() => loadCredentials(path), /16 KiB/);
});

test('环境令牌要求明确实例且不读取本地凭据，URL 不接受控制字符或跨实例覆盖', async () => {
  let loads = 0;
  const load = () => {
    loads++;
    return Promise.resolve({ url: 'https://hub.example.test', token: 'saved-token' });
  };
  const selected = await resolveConsumerCredentials({
    url: 'http://192.168.1.20:4100/',
    environmentToken: 'explicit-token',
    load,
  });
  assert.equal(selected.url, 'http://192.168.1.20:4100');
  assert.equal(loads, 0);
  await assert.rejects(() =>
    resolveConsumerCredentials({ environmentToken: 'explicit-token', load }),
  );
  await assert.rejects(
    () => resolveConsumerCredentials({ url: 'https://other.example.test', load }),
    /不一致/,
  );
  for (const url of [
    'https://hub.example.test\n',
    'https://hub.example.test/path',
    'ftp://public.example.test',
    'https://user:secret@hub.example.test',
    'https://hub.example.test?token=secret',
  ])
    assert.throws(() => hubUrl(url));
  assert.equal(hubUrl('http://127.0.0.1:4100/'), 'http://127.0.0.1:4100');
});
