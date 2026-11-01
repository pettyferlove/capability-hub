import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { IssuedTokenResponse, MeResponse } from '@capability-hub/contracts/http';
import { has } from '@capability-hub/domain/rbac';
import { createTestHub, testPassword } from '../support/application.js';
import { externalDatabase, externalVariable } from '../support/external.js';
import { httpClient, signIn } from '../support/http.js';

const login = { provider: 'ldap', username: 'ldap-demo', password: 'hub-demo-local' };
function directory(defaultRoles = ['maintainer', 'reader']) {
  return {
    url: externalVariable('CAPABILITY_HUB_TEST_LDAP_URL'),
    baseDn: 'ou=people,dc=hub,dc=test',
    bindDn: 'cn=hub-reader,dc=hub,dc=test',
    bindPassword: 'hub-reader-local',
    defaultRoles,
  };
}

test('OpenLDAP 并发首次登录共用账号和团队，撤销的维护者角色不会在重登时恢复', async (context) => {
  const database = await externalDatabase();
  const fixture = await createTestHub(context, {
    database: { driver: 'postgresql', url: database.url, poolSize: 4 },
    ldap: directory(),
  });
  context.after(async () => {
    await fixture.close();
    await database.close();
  });
  const clients = [httpClient(fixture), httpClient(fixture)];
  const status = await clients[0].get('/api/auth/status').expect(200);
  assert.equal(status.body.ldap_enabled, true);
  await Promise.all(clients.map((client) => client.post('/auth/login').send(login).expect(200)));
  const [first, second] = await Promise.all(
    clients.map((client) => client.get('/api/me').expect(200)),
  );
  const me = first.body as MeResponse;
  assert.equal(me.id, (second.body as MeResponse).id);
  assert.equal(me.auth_provider, 'ldap');
  assert.equal(me.display_name, 'LDAP Demo');
  assert.equal(me.groups.length, 1);
  const principal = await fixture.hub.identity.principal(me.id);
  assert(has(principal, 'asset:maintain', { team: me.groups[0].id }));
  assert(!has(principal, 'asset:maintain', { team: fixture.teamId }));
  assert(!has(principal, 'identity:manage'));
  const grants = await fixture.store.where('role_bindings', 'principal_id', me.id);
  const roles = await Promise.all(grants.map((grant) => fixture.store.get('roles', grant.role_id)));
  assert.deepEqual(roles.map((role) => role?.key).sort(), ['maintainer', 'reader']);
  const maintainer = grants.find((grant) => grant.scope_type === 'team');
  assert(maintainer);
  await fixture.hub.administration.removeGrant(fixture.admin, 'role_bindings', maintainer.id);
  await clients[0]
    .post('/auth/login')
    .send({ ...login, username: 'LDAP-DEMO' })
    .expect(200);
  assert.equal((await clients[0].get('/api/me').expect(200)).body.capabilities.can_publish, false);
});

test('目录密码只在 OpenLDAP 校验，错误凭据不建号，只读默认角色不建团队', async (context) => {
  const fixture = await createTestHub(context, { ldap: directory(['reader']) });
  const client = httpClient(fixture);
  for (const credentials of [
    { ...login, password: 'wrong' },
    { ...login, username: '*' },
    { ...login, username: 'missing' },
  ]) {
    const denied = await client.post('/auth/login').send(credentials).expect(401);
    assert.equal(denied.body.error.code, 'INVALID_CREDENTIALS');
  }
  assert.equal(await fixture.store.find('users', 'username', login.username), undefined);
  await client.post('/auth/login').send(login).expect(200);
  const me = (await client.get('/api/me').expect(200)).body as MeResponse;
  assert.deepEqual(me.groups, []);
  assert.equal(me.capabilities.can_publish, false);
  client.set('X-CSRF-Token', me.csrf_token);
  const user = await fixture.hub.identity.activeUser(me.id);
  assert.equal(user.password_hash, null);
  const admin = await signIn(fixture);
  const self = await client
    .post('/api/password')
    .send({ current_password: login.password, new_password: testPassword })
    .expect(422);
  const reset = await admin
    .patch('/api/admin/users/' + user.id)
    .set('If-Match', '"1"')
    .send({ password: testPassword })
    .expect(422);
  assert.equal(self.body.error.code, 'DIRECTORY_PASSWORD_MANAGED');
  assert.equal(reset.body.error.code, 'DIRECTORY_PASSWORD_MANAGED');
  await admin
    .patch('/api/admin/users/' + user.id)
    .set('If-Match', '"1"')
    .send({ active: false })
    .expect(200);
  await client.post('/auth/login').send(login).expect(401);
  await client.get('/api/me').expect(401);
});

test('目录绑定故障只影响显式 LDAP 登录，未知来源被拒绝', async (context) => {
  const fixture = await createTestHub(context, {
    ldap: { ...directory(), bindPassword: 'wrong-service-password' },
  });
  const client = httpClient(fixture);
  const failed = await client.post('/auth/login').send(login).expect(503);
  assert.equal(failed.body.error.code, 'LDAP_UNAVAILABLE');
  assert.equal(failed.body.error.retryable, true);
  assert.equal((await fixture.store.all('login_attempts')).length, 0);
  await fixture.hub.administration.createUser(fixture.admin, {
    username: login.username,
    display_name: '本地账号',
    password: testPassword,
    group_ids: [],
  });
  await client.post('/auth/login').send(login).expect(503);
  await client
    .post('/auth/login')
    .send({ ...login, provider: 'auto' })
    .expect(422);
  await client
    .post('/auth/login')
    .send({ username: login.username, password: login.password })
    .expect(401);
  await client
    .post('/auth/login')
    .send({ username: login.username, password: testPassword })
    .expect(200);
});

test('同名 OpenLDAP 和本地账号可持有独立会话、权限与停用状态', async (context) => {
  const fixture = await createTestHub(context, { ldap: directory() });
  const ldap = httpClient(fixture);
  const local = httpClient(fixture);
  await local
    .post('/auth/login')
    .send({ username: login.username, password: login.password })
    .expect(401);
  await ldap.post('/auth/login').send(login).expect(200);
  const directoryUser = (await ldap.get('/api/me').expect(200)).body as MeResponse;
  const localUser = await fixture.hub.administration.createUser(fixture.admin, {
    username: login.username,
    display_name: '同名本地账号',
    password: testPassword,
    group_ids: [],
  });
  assert.notEqual(directoryUser.id, localUser.id);
  await local
    .post('/auth/login')
    .send({ ...login, provider: 'local' })
    .expect(401);
  await local
    .post('/auth/login')
    .send({ ...login, password: testPassword })
    .expect(401);
  await local
    .post('/auth/login')
    .send({ ...login, provider: 'local', password: testPassword })
    .expect(200);
  const native = (await local.get('/api/me').expect(200)).body as MeResponse;
  assert.equal(native.id, localUser.id);
  assert.equal(native.auth_provider, 'local');
  assert.equal(directoryUser.auth_provider, 'ldap');
  assert.equal(native.capabilities.can_publish, false);
  assert.equal(directoryUser.capabilities.can_publish, true);
  const [localToken, directoryToken] = await Promise.all([
    local
      .post('/api/tokens')
      .set('X-CSRF-Token', native.csrf_token)
      .send({ name: '本地工具' })
      .expect(200),
    ldap
      .post('/api/tokens')
      .set('X-CSRF-Token', directoryUser.csrf_token)
      .send({ name: '目录工具' })
      .expect(200),
  ]);
  const tokenIdentity = (issued: IssuedTokenResponse) =>
    httpClient(fixture)
      .get('/api/me')
      .set('Authorization', 'Bearer ' + issued.token);
  assert.equal(
    (await tokenIdentity(directoryToken.body as IssuedTokenResponse).expect(200)).body.id,
    directoryUser.id,
  );
  for (const [userId, provider] of [
    [native.id, 'local'],
    [directoryUser.id, 'ldap'],
  ]) {
    const events = await fixture.store.where('audit', 'actor_id', userId);
    assert.equal(
      events.find((event) => event.action === 'identity.login')?.metadata.provider,
      provider,
    );
  }
  await fixture.hub.administration.updateUser(
    fixture.admin,
    directoryUser.id,
    { active: false },
    '"1"',
  );
  await ldap.get('/api/me').expect(401);
  await ldap.post('/auth/login').send(login).expect(401);
  await tokenIdentity(directoryToken.body as IssuedTokenResponse).expect(401);
  assert.equal(
    (await tokenIdentity(localToken.body as IssuedTokenResponse).expect(200)).body.id,
    localUser.id,
  );
  assert.equal((await local.get('/api/me').expect(200)).body.id, localUser.id);
});
