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
  const path = join(root, 'config/auth.json');
  const value = { url: 'https://hub.example.test', token: 'hub_token_for_test' };
  await saveCredentials(path, value);
  assert.deepEqual(await loadCredentials(path), value);
  assert.equal((await stat(path)).mode & 0o777, 0o600);
  await chmod(path, 0o644);
  await assert.rejects(() => loadCredentials(path), /私有普通文件/);
  await saveCredentials(path, value);
  assert.equal((await stat(path)).mode & 0o777, 0o600);
  await mkdir(join(root, 'outside'));
  await symlink(join(root, 'outside'), join(root, 'link'));
  await assert.rejects(() => saveCredentials(join(root, 'link/child/auth.json'), value));
  await assert.rejects(() => readFile(join(root, 'outside/child/auth.json')), { code: 'ENOENT' });
  await writeFile(path, 'x'.repeat(16385), { mode: 0o600 });
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
