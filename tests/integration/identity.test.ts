import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { AuthenticationService } from '@capability-hub/application';
import type { DirectoryAuthenticator } from '@capability-hub/application/ports';
import { sha256 } from '@capability-hub/domain/canonical';
import { HubError } from '@capability-hub/domain/errors';
import { ScryptPasswordHasher } from '@capability-hub/infrastructure/security';
import {
  createTestApplication,
  createTestHub,
  receiveSkill,
  testPassword,
  type TestHub,
} from '../support/application.js';
import { deferred } from '../support/store.js';
import { signIn } from '../support/http.js';

const code = (value: string) => (error: unknown) =>
  error instanceof HubError && error.code === value;

test('场景管理员合并词条后按目标检索，历史发布和场景审核权仍引用原 ID', async (context) => {
  const f = await createTestHub(context);
  const old = await f.store.insert('scenarios', {
    id: randomUUID(),
    name: '合并请求检查',
    description: '',
    active: true,
  });
  const target = await f.hub.administration.createScenario(f.admin, { name: '代码评审' });
  const role = (await f.store.find('roles', 'key', 'reviewer'))!;
  await f.hub.administration.grantRole(f.admin, {
    principal_id: f.reader.id,
    role_id: role.id,
    scope_type: 'scenario',
    scope_id: old.id,
  });
  const user = await f.hub.identity.principal(f.reader.id);
  const intake = await receiveSkill(f);
  const body = {
    source_intake_id: intake.id,
    version_id: intake.version_id,
    base_release_id: null,
    category: 'scenario' as const,
    scenario_ids: [old.id],
    distribution: { mode: 'approved_audience' as const, audience: ['public'] },
    applies_to: { keywords: ['代码规范'] },
    purpose: '共享评审流程',
  };
  const request = await f.hub.publications.submit(f.admin, body, randomUUID());
  await f.hub.publications.decide(
    f.reviewer,
    request.id,
    {
      decision: 'approve',
      policy_digest: request.policy_digest,
      comment: '',
      accepted_warnings: [],
    },
    '"1"',
    randomUUID(),
  );
  const release = (await f.store.all('releases'))[0];
  const client = await signIn(f);
  const readOnly = await signIn(f, 'reader');
  const path = '/api/admin/scenarios/' + old.id;
  const merge = { action: 'merge', target_id: target.id };
  await readOnly
    .patch(path)
    .set('If-Match', '"1"')
    .set('Idempotency-Key', randomUUID())
    .send(merge)
    .expect(403);
  const edit = { action: 'edit', name: '合并审查', description: '评审提交改动' };
  await client
    .patch(path)
    .set('If-Match', '"1"')
    .set('Idempotency-Key', randomUUID())
    .send(edit)
    .expect('ETag', '"2"')
    .expect(200);
  await client
    .patch(path)
    .set('If-Match', '"1"')
    .set('Idempotency-Key', randomUUID())
    .send(merge)
    .expect(412);
  const key = randomUUID();
  for (let i = 0; i < 2; i++)
    await client
      .patch(path)
      .set('If-Match', '"2"')
      .set('Idempotency-Key', key)
      .send(merge)
      .expect('ETag', '"3"')
      .expect(200);
  assert.deepEqual(await f.store.get('releases', release.id), release);
  assert.deepEqual(
    (await f.hub.catalog.listScenarios(null)).map((s) => s.id),
    [target.id],
  );
  assert.equal((await f.hub.catalog.search(null, { scenario_id: target.id })).total, 1);
  assert.equal(
    (await f.hub.catalog.suggestKeywords(null, { scenario_id: target.id })).items[0].keyword,
    '代码规范',
  );
  const next = await f.hub.publications.submit(
    f.admin,
    {
      ...body,
      base_release_id: release.id,
      scenario_ids: [target.id],
      distribution: { mode: 'approved_audience', audience: ['group:' + f.teamId] },
    },
    randomUUID(),
  );
  assert.equal(await f.hub.assetAccess.canReview(user, next), false);
  await client
    .patch('/api/admin/scenarios/' + target.id)
    .set('If-Match', '"1"')
    .set('Idempotency-Key', randomUUID())
    .send({ action: 'disable' })
    .expect(200);
  await assert.rejects(
    () =>
      f.hub.publications.decide(
        f.reviewer,
        next.id,
        {
          decision: 'approve',
          policy_digest: next.policy_digest,
          comment: '',
          accepted_warnings: [],
        },
        '"1"',
        randomUUID(),
      ),
    code('INVALID_SCENARIO'),
  );
  assert.deepEqual(await f.hub.catalog.listScenarios(null), []);
  assert.equal((await f.hub.catalog.search(null, {})).total, 1);
});

function directoryLogin(hub: TestHub['hub'], authenticator: DirectoryAuthenticator) {
  return new AuthenticationService(
    hub.store,
    hub.identity,
    hub.sessions,
    new ScryptPasswordHasher(),
    {
      authenticator,
      defaultRoles: ['reader'],
    },
  );
}

test('目录认证不能抢先初始化平台，并与校验期间创建的同名本地账号各自建号', async (context) => {
  const { hub, store } = await createTestApplication(context);
  const identity = { entryUuid: randomUUID(), displayName: '目录成员' };
  const auth = directoryLogin(hub, { authenticate: async () => identity });
  await assert.rejects(
    () => auth.login('member', testPassword, 'test', 'ldap'),
    code('INVALID_CREDENTIALS'),
  );
  assert.equal((await store.all('users')).length, 0);
  const user = await hub.authentication.setup({
    username: 'owner',
    password: testPassword,
    display_name: '管理员',
    team_name: '研发',
  });
  const entered = deferred(),
    release = deferred();
  const pending = directoryLogin(hub, {
    async authenticate() {
      entered.resolve();
      await release.promise;
      return identity;
    },
  }).login('member', 'directory-password', 'test', 'ldap');
  await entered.promise;
  try {
    await hub.administration.createUser(await hub.identity.principal(user.id), {
      username: 'member',
      password: testPassword,
      display_name: '本地成员',
      group_ids: [],
    });
  } finally {
    release.resolve();
  }
  const ldap = await pending;
  const local = await auth.login('member', testPassword, 'test');
  assert.equal(ldap.ldap_entry_uuid, identity.entryUuid);
  assert.equal(local.ldap_entry_uuid, undefined);
  assert.notEqual(ldap.id, local.id);
});

test('同一目录条目更名保留账号，复用旧 uid 的其他条目不能继承授权', async (context) => {
  const { hub } = await createTestHub(context);
  let entryUuid = randomUUID();
  const auth = directoryLogin(hub, {
    authenticate: async () => ({ entryUuid, displayName: '成员' }),
  });
  const first = await auth.login('member', testPassword, 'test', 'ldap');
  const renamed = await auth.login('renamed', testPassword, 'test', 'ldap');
  assert.equal(renamed.id, first.id);
  assert.equal(renamed.username, 'renamed');
  entryUuid = randomUUID();
  await assert.rejects(
    () => auth.login('renamed', testPassword, 'test', 'ldap'),
    code('INVALID_CREDENTIALS'),
  );
  await assert.rejects(
    () => hub.authentication.login('renamed', testPassword, 'test'),
    code('INVALID_CREDENTIALS'),
  );
  await assert.rejects(
    () => hub.authentication.login('owner', testPassword, 'test', 'ldap'),
    code('LDAP_DISABLED'),
  );
});

test('一个来源的登录失败不会锁住同名另一账号，另一来源的成功也不会清除锁定', async (context) => {
  const { hub } = await createTestHub(context);
  const identity = { entryUuid: randomUUID(), displayName: '目录成员' };
  const directoryPassword = 'separate-directory-password';
  const auth = directoryLogin(hub, {
    authenticate: async (_username, password) =>
      password === directoryPassword ? identity : undefined,
  });
  for (const limited of ['local', 'ldap'] as const) {
    const other = limited === 'ldap' ? 'local' : 'ldap';
    const address = 'test-' + limited;
    for (let i = 0; i < 8; i++)
      await assert.rejects(
        () => auth.login('owner', 'wrong', address, limited),
        code('INVALID_CREDENTIALS'),
      );
    await auth.login('owner', other === 'local' ? testPassword : directoryPassword, address, other);
    await assert.rejects(
      () =>
        auth.login(
          'owner',
          limited === 'local' ? testPassword : directoryPassword,
          address,
          limited,
        ),
      code('LOGIN_RATE_LIMIT'),
    );
  }
});

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
