import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GitRepositoryAdapter } from '@capability-hub/infrastructure/git';
import { HubError } from '@capability-hub/domain/errors';

const code = (expected: string) => (error: unknown) =>
  error instanceof HubError && error.code === expected;
const options = {
  dataDir: '/tmp',
  gitHosts: ['git.example.test', '[::1]'],
  privateGitHosts: [] as string[],
};

test('Git 校验检查全部 DNS 结果，拒绝私网、组播、映射地址和 IPv6 展开写法', async () => {
  for (const address of [
    '127.0.0.1',
    '10.1.2.3',
    '169.254.169.254',
    '100.100.1.1',
    '198.19.0.1',
    '224.0.0.1',
    '::1',
    '0:0:0:0:0:0:0:1',
    '::ffff:192.168.1.1',
    'fd00::1',
    'fe80::1',
    'ff02::1',
    'not-an-address',
  ]) {
    const repository = new GitRepositoryAdapter(options, undefined, () =>
      Promise.resolve([{ address: '8.8.8.8' }, { address }]),
    );
    await assert.rejects(
      () => repository.validate('https://git.example.test/team/repo.git'),
      code('GIT_ADDRESS_DENIED'),
      address,
    );
  }
});

test('显式私网主机可使用 loopback，URL 标识保留端口并移除 Git 后缀', async () => {
  const repository = new GitRepositoryAdapter({ ...options, privateGitHosts: ['[::1]'] });
  const destination = await repository.validate('ssh://git@[::1]:2222/team/repo.git/');
  assert.equal(destination.identity, '[::1]:2222/team/repo');
  assert.equal(destination.address, '::1');
  assert.equal(destination.port, 2222);
  await assert.rejects(() => repository.validate('ssh://git@[::1]:2222/'), code('GIT_URL'));
});

test('Git URL 不接收凭据、跳转参数、任意协议或未允许域名；DNS 失败有明确错误', async () => {
  const repository = new GitRepositoryAdapter(options, undefined, () =>
    Promise.resolve([{ address: '2606:4700:4700::1111' }]),
  );
  assert.equal((await repository.validate('git@git.example.test:team/repo.git')).transport, 'ssh');
  for (const url of [
    'file:///tmp/repo',
    'https://user@git.example.test/repo',
    'https://git.example.test/repo?token=secret',
    'https://git.example.test/repo#main',
    'ssh://-flag@git.example.test/repo',
    'https://git.example.test/repo\n',
  ])
    await assert.rejects(() => repository.validate(url), code('GIT_URL'));
  await assert.rejects(
    () => repository.validate('https://other.example.test/repo'),
    code('GIT_HOST_DENIED'),
  );
  const brokenDns = new GitRepositoryAdapter(options, undefined, () =>
    Promise.reject(new Error('DNS unavailable')),
  );
  await assert.rejects(
    () => brokenDns.validate('https://git.example.test/repo'),
    code('GIT_DNS_FAILED'),
  );
});
