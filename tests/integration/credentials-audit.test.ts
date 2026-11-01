import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HubError } from '@capability-hub/domain/errors';
import { createTestHub } from '../support/application.js';

const code = (expected: string) => (error: unknown) =>
  error instanceof HubError && error.code === expected;

test('Git 凭据仅供所属账号选择，轮换使用修订约束，撤销移除密文且不能恢复', async (context) => {
  const fixture = await createTestHub(context);
  const input = {
    name: '仓库读取',
    host: 'github.com',
    kind: 'token',
    auth_method: 'bearer',
    secret: 'fixture-secret-v1',
  };
  const credential = await fixture.hub.credentials.save(fixture.admin, input);
  assert.equal('encrypted' in credential, false);
  const stored = await fixture.store.get('git_credentials', credential.id);
  assert(stored?.encrypted);
  assert.equal(JSON.stringify(stored).includes(input.secret), false);
  await assert.rejects(
    () =>
      fixture.hub.credentials.select(fixture.reader, credential.id, {
        host: 'github.com',
        transport: 'https',
      }),
    code('CREDENTIAL_FORBIDDEN'),
  );
  await assert.rejects(
    () => fixture.hub.credentials.resolve(credential.id, 'gitlab.com', 'https'),
    code('CREDENTIAL_MISMATCH'),
  );
  assert.equal(
    (await fixture.hub.credentials.resolve(credential.id, 'github.com', 'https')).secret,
    input.secret,
  );
  const rotated = await fixture.hub.credentials.save(
    fixture.admin,
    { ...input, secret: 'fixture-secret-v2' },
    credential.id,
    '"1"',
  );
  assert.equal(rotated.revision, 2);
  await assert.rejects(
    () => fixture.hub.credentials.save(fixture.admin, input, credential.id, '"1"'),
    code('REVISION_CONFLICT'),
  );
  assert.equal(
    (await fixture.hub.credentials.resolve(credential.id, 'github.com', 'https')).secret,
    'fixture-secret-v2',
  );
  await fixture.hub.credentials.revoke(fixture.admin, credential.id, '"2"');
  assert.equal((await fixture.store.get('git_credentials', credential.id))?.encrypted, null);
  await assert.rejects(
    () => fixture.hub.credentials.resolve(credential.id, 'github.com', 'https'),
    code('CREDENTIAL_UNAVAILABLE'),
  );
  await assert.rejects(
    () => fixture.hub.credentials.save(fixture.admin, input, credential.id, '"3"'),
    code('CREDENTIAL_IMMUTABLE'),
  );
});

test('审计名称保持事件快照，搜索和分页汇总一致，普通用户不能读取管理员审计', async (context) => {
  const fixture = await createTestHub(context);
  const oldName = fixture.admin.display_name;
  await fixture.hub.administration.createGroup(fixture.admin, { name: '审计检索测试团队' });
  await fixture.hub.administration.updateUser(
    fixture.admin,
    fixture.admin.id,
    { display_name: '更改后的操作人' },
    '"1"',
  );
  const response = await fixture.hub.audit.list(fixture.admin, {
    q: '审计检索测试团队',
    page_size: 1,
  });
  assert.equal(response.total, 1);
  assert.equal(response.items.length, 1);
  assert.equal(response.items[0].actor.name, oldName);
  assert.equal(response.items[0].actor.name_source, 'event');
  assert.equal(response.items[0].subject.name, '审计检索测试团队');
  assert.equal(response.summary.identity, 1);
  await assert.rejects(() => fixture.hub.audit.list(fixture.reader, {}), code('FORBIDDEN'));
});

test('IPv6 凭据主机与配置允许列表保持相同规范，保存和解析不会误拒绝方括号地址', async (context) => {
  const fixture = await createTestHub(context, { gitHosts: ['[::1]'], privateGitHosts: ['[::1]'] });
  const credential = await fixture.hub.credentials.save(fixture.admin, {
    name: 'IPv6 仓库',
    host: '[::1]',
    kind: 'token',
    auth_method: 'bearer',
    secret: 'fixture-ipv6-token',
  });
  await fixture.hub.credentials.select(fixture.admin, credential.id, {
    host: '[::1]',
    transport: 'https',
  });
  assert.equal(
    (await fixture.hub.credentials.resolve(credential.id, '[::1]', 'https')).secret,
    'fixture-ipv6-token',
  );
});
