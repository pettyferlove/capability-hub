import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sha256 } from '@capability-hub/domain/canonical';
import { HubError } from '@capability-hub/domain/errors';
import { createTestHub, testPassword } from '../support/application.js';

const code = (value: string) => (error: unknown) =>
  error instanceof HubError && error.code === value;

test('账号管理输出公开字段，权限按团队生效，外部成员无法创建账号', async (context) => {
  const fixture = await createTestHub(context);
  await assert.rejects(
    () =>
      fixture.hub.administration.createUser(fixture.reader, {
        username: 'denied',
        display_name: '拒绝创建',
        password: testPassword,
        group_ids: [],
      }),
    code('FORBIDDEN'),
  );
  const snapshot = await fixture.hub.administration.adminSnapshot(fixture.admin);
  assert.equal(snapshot.users.length, 3);
  assert.equal(
    snapshot.users.every((user) => !Object.hasOwn(user, 'password_hash')),
    true,
  );
  const me = await fixture.hub.profile.current(fixture.admin, 'current-csrf');
  assert.equal(me.capabilities.can_publish, true);
  assert.equal(me.csrf_token, 'current-csrf');
  assert.equal(Object.hasOwn(me, 'permissions'), false);
  assert.equal(Object.hasOwn(me, 'bindings'), false);
});

test('密码变更撤销所有网页会话，旧密码失效，访问令牌仍可由用户单独撤销', async (context) => {
  const fixture = await createTestHub(context);
  const user = await fixture.hub.authentication.login('OWNER', testPassword, 'test-address');
  const first = await fixture.hub.sessions.create(user, null);
  const second = await fixture.hub.sessions.create(user);
  const token = await fixture.hub.tokens.issue(fixture.admin, { name: '个人工具' });
  await fixture.hub.authentication.changePassword(
    fixture.admin,
    testPassword,
    'A-new-test-password!',
  );
  assert.equal(await fixture.hub.sessions.find(first.token), undefined);
  assert.equal(await fixture.hub.sessions.find(second.token), undefined);
  await assert.rejects(
    () => fixture.hub.authentication.login('owner', testPassword, 'test-address'),
    code('INVALID_CREDENTIALS'),
  );
  assert.equal(
    (await fixture.hub.authentication.login('owner', 'A-new-test-password!', 'test-address')).id,
    user.id,
  );
  assert.equal((await fixture.hub.tokens.find(token.token))?.revoked_at, null);
  await fixture.hub.tokens.revoke(user.id, sha256(token.token));
  assert.notEqual((await fixture.hub.tokens.find(token.token))?.revoked_at, null);
});

test('不能停用或移除最后一个平台管理员，失败后账号和授权均保持原状', async (context) => {
  const fixture = await createTestHub(context);
  await assert.rejects(
    () =>
      fixture.hub.administration.updateUser(
        fixture.admin,
        fixture.admin.id,
        { active: false },
        '"1"',
      ),
    code('LAST_ADMIN'),
  );
  assert.equal((await fixture.hub.identity.principal(fixture.admin.id)).active, true);
  const adminRole = await fixture.store.find('roles', 'key', 'admin');
  assert(adminRole);
  const binding = (await fixture.store.all('role_bindings')).find(
    (value) => value.principal_id === fixture.admin.id && value.role_id === adminRole.id,
  );
  assert(binding);
  await assert.rejects(
    () => fixture.hub.administration.removeGrant(fixture.admin, 'role_bindings', binding.id),
    code('LAST_ADMIN'),
  );
  assert(await fixture.store.get('role_bindings', binding.id));
});

test('CLI 批准只可被正确校验码消费一次，并发轮询不会重复签发令牌', async (context) => {
  const fixture = await createTestHub(context);
  const verifier = 'test-verifier-with-at-least-32-characters';
  const login = await fixture.hub.cliLogin.request({ challenge: sha256(verifier) });
  await assert.rejects(
    () => fixture.hub.cliLogin.poll({ device_code: login.device_code, verifier: 'x'.repeat(40) }),
    code('CLI_LOGIN_EXPIRED'),
  );
  assert.deepEqual(await fixture.hub.cliLogin.poll({ device_code: login.device_code, verifier }), {
    state: 'pending',
  });
  await fixture.hub.cliLogin.approve(fixture.admin, { code: login.user_code });
  const results = await Promise.allSettled(
    [0, 1].map(() => fixture.hub.cliLogin.poll({ device_code: login.device_code, verifier })),
  );
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  const rejected = results.find((result) => result.status === 'rejected');
  assert(rejected?.status === 'rejected' && code('CLI_LOGIN_USED')(rejected.reason));
  assert.equal((await fixture.store.all('tokens')).length, 1);
});

test('登录失败达到限额后拒绝继续登录，失败事件不记录明文密码', async (context) => {
  const fixture = await createTestHub(context);
  for (let attempt = 0; attempt < 8; attempt++)
    await assert.rejects(
      () => fixture.hub.authentication.login('owner', 'wrong-secret', 'same-address'),
      code('INVALID_CREDENTIALS'),
    );
  await assert.rejects(
    () => fixture.hub.authentication.login('owner', testPassword, 'same-address'),
    code('LOGIN_RATE_LIMIT'),
  );
  const failures = (await fixture.store.all('audit')).filter(
    (event) => event.action === 'identity.login_failed',
  );
  assert.equal(failures.length, 8);
  assert.equal(
    failures.every((event) => event.result === 'failure' && event.reason === 'invalid_credentials'),
    true,
  );
  assert.equal(JSON.stringify(failures).includes('wrong-secret'), false);
});
