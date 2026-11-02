import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sha256 } from '@capability-hub/domain/canonical';
import { createTestHub, publishSkill, testPassword } from '../support/application.js';
import { httpClient, signIn } from '../support/http.js';

function assertFailure(
  response: { status: number; body: { error?: unknown } },
  status: number,
  code: string,
) {
  assert.equal(response.status, status);
  assert(response.body.error && typeof response.body.error === 'object');
  assert('code' in response.body.error);
  assert.equal(response.body.error.code, code);
  assert('request_id' in response.body.error);
  assert.match(String(response.body.error.request_id), /^[a-f0-9-]{36}$/);
}

test('生产 HTTP 支持内网地址的登录会话，匿名目录、来源和 CSRF 校验按权限生效', async (context) => {
  const fixture = await createTestHub(context, {
    production: true,
    publicUrl: 'http://192.168.1.20:4100',
  });
  const guest = httpClient(fixture);
  await guest.get('/api/assets').expect(200);
  assertFailure(await guest.get('/api/me'), 401, 'UNAUTHENTICATED');
  assertFailure(await guest.get('/api/admin/identity'), 401, 'UNAUTHENTICATED');
  assertFailure(
    await guest
      .post('/auth/login')
      .set('Origin', 'https://untrusted.example')
      .send({ username: 'owner', password: testPassword }),
    403,
    'ORIGIN_REJECTED',
  );
  assertFailure(
    await guest.get('/api/assets').set('Host', 'untrusted.example'),
    403,
    'HOST_REJECTED',
  );
  const login = await guest
    .post('/auth/login')
    .set('X-Forwarded-Proto', 'https')
    .send({ username: 'owner', password: testPassword })
    .expect(200);
  const cookie = login.headers['set-cookie'];
  assert(Array.isArray(cookie));
  assert.match(cookie[0], /HttpOnly/);
  assert.match(cookie[0], /SameSite=Strict/);
  assert.doesNotMatch(cookie[0], /; Secure\b/i);
  assertFailure(await guest.post('/api/tokens').send({ name: '缺少 CSRF' }), 403, 'CSRF_REJECTED');
  const me = await guest.get('/api/me').expect(200);
  const issued = await guest
    .post('/api/tokens')
    .set('X-CSRF-Token', me.body.csrf_token)
    .send({ name: '终端读取' })
    .expect(200);
  assert.deepEqual(Object.keys(issued.body), ['token']);
  await guest.post('/auth/logout').set('X-CSRF-Token', me.body.csrf_token).send({}).expect(200);
  assertFailure(await guest.get('/api/me'), 401, 'UNAUTHENTICATED');
});

test('HTTPS 入口经 HTTP 转发登录请求时仍签发 Secure 会话 Cookie', async (context) => {
  const fixture = await createTestHub(context, {
    production: true,
    publicUrl: 'https://hub.example.test',
  });
  const login = await httpClient(fixture)
    .post('/auth/login')
    .send({ username: 'owner', password: testPassword })
    .expect(200);
  const cookie = login.headers['set-cookie'];
  assert(Array.isArray(cookie));
  assert.match(cookie[0], /; Secure\b/i);
});

test('Bearer 只访问消费接口，不能读取个人管理资料；失效凭据不会降级为匿名读取', async (context) => {
  const fixture = await createTestHub(context);
  const token = await fixture.hub.tokens.issue(fixture.admin, { name: '只读工具' });
  const client = httpClient(fixture).set('Authorization', 'Bearer ' + token.token);
  await client.get('/api/me').expect(200);
  await client.get('/api/assets').expect(200);
  assertFailure(await client.get('/api/me/profile'), 403, 'TOKEN_SCOPE');
  assertFailure(await client.get('/api/admin/identity'), 403, 'TOKEN_SCOPE');
  assertFailure(await client.post('/api/tokens').send({ name: '拒绝写入' }), 403, 'TOKEN_SCOPE');
  await fixture.hub.tokens.revoke(fixture.admin.id, sha256(token.token));
  assertFailure(await client.get('/api/assets'), 401, 'UNAUTHENTICATED');
  assertFailure(
    await httpClient(fixture).get('/api/assets').set('Authorization', 'Basic invalid'),
    401,
    'UNAUTHENTICATED',
  );
});

test('HTTP 输入校验拒绝重复 JSON 字段、重复查询参数与超大请求', async (context) => {
  const fixture = await createTestHub(context);
  const client = await signIn(fixture);
  assertFailure(await client.get('/api/assets?q=one&q=two'), 422, 'VALIDATION_ERROR');
  assertFailure(await client.get('/api/assets?limit=0'), 422, 'VALIDATION_ERROR');
  assertFailure(
    await client
      .post('/api/tokens')
      .set('Content-Type', 'application/json')
      .send('{"name":"first","name":"second"}'),
    422,
    'JSON_DUPLICATE',
  );
  assertFailure(
    await client.post('/api/tokens').send({ name: 'x'.repeat(1024 * 1024 + 100) }),
    413,
    'PAYLOAD_LIMIT',
  );
  assertFailure(await httpClient(fixture).post('/auth/setup').send({}), 422, 'VALIDATION_ERROR');
  assert.equal((await fixture.store.all('tokens')).length, 0);
});

test('公开固定链接交付同一版本的安装说明、文件与归档，撤权后全部失效', async (context) => {
  const fixture = await createTestHub(context);
  const { intake } = await publishSkill(fixture);
  const guest = httpClient(fixture);
  const path = '/skills/sample-skill/1.0.0';
  const guide = await guest.get(path).expect(200);
  assert.match(guide.headers['content-type'], /^text\/markdown/);
  assert.match(guide.text, /sample-skill/);
  assert.match(guide.text, /SKILL\.md/);
  assert.equal(guide.text.includes('/api/'), false);
  const file = await guest.get(path + '/files/SKILL.md').expect(200);
  assert.match(file.text, /# 工程实践/);
  const download = await guest
    .get(path + '/download')
    .buffer(true)
    .parse((response, done) => {
      const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer) => chunks.push(chunk));
      response.on('error', (error: Error) => done(error, undefined));
      response.on('end', () => done(null, Buffer.concat(chunks)));
    })
    .expect(200);
  assert(Buffer.isBuffer(download.body));
  const version = await fixture.store.get('versions', intake.version_id);
  assert(version);
  assert.equal('sha256:' + sha256(download.body), version.artifact_digest);
  assertFailure(await guest.get('/skills/sample-skill/2.0.0'), 404, 'NOT_FOUND');
  await guest.get('/api/assets').expect(200);
  const owner = await signIn(fixture);
  await owner
    .post(`/api/sources/${intake.source_id}/revoke-distribution`)
    .set('If-Match', '"1"')
    .send({ reason: '撤回共享授权' })
    .expect(200);
  assert.equal((await guest.get('/api/assets').expect(200)).body.total, 0);
  for (const suffix of ['', '/files/SKILL.md', '/download'])
    assertFailure(await guest.get(path + suffix), 404, 'NOT_FOUND');
});

test('个人资料采用修订控制，会话列表只返回安全字段，其他人的会话不能被撤销', async (context) => {
  const fixture = await createTestHub(context);
  const owner = await signIn(fixture);
  const second = await signIn(fixture);
  const reader = await signIn(fixture, 'reader');
  const profile = await owner.get('/api/me/profile').expect(200);
  assert.equal(profile.body.display_name, '维护者');
  const input = { display_name: '更新的名称', title: '', bio: '', email: '', avatar_color: 'teal' };
  assertFailure(await owner.patch('/api/me/profile').send(input), 428, 'IF_MATCH_REQUIRED');
  await owner.patch('/api/me/profile').set('If-Match', '"1"').send(input).expect(200);
  assertFailure(
    await owner.patch('/api/me/profile').set('If-Match', '"1"').send(input),
    412,
    'REVISION_CONFLICT',
  );
  const sessions = await owner.get('/api/me/sessions').expect(200);
  assert.equal(sessions.body.length, 2);
  const current = sessions.body.find((value: { current: boolean }) => value.current);
  const other = sessions.body.find((value: { current: boolean }) => !value.current);
  assert.deepEqual(
    Object.keys(current).sort(),
    ['id', 'current', 'created_at', 'expires_at', 'client'].sort(),
  );
  assertFailure(await reader.delete('/api/me/sessions/' + other.id), 404, 'NOT_FOUND');
  assertFailure(await owner.delete('/api/me/sessions/' + current.id), 422, 'CURRENT_SESSION');
  await owner.delete('/api/me/sessions/' + other.id).expect(200);
  assertFailure(await second.get('/api/me'), 401, 'UNAUTHENTICATED');
});

test('归档下载读取成功后才追加审计，读取失败和撤权请求不会记为成功下载', async (context) => {
  const fixture = await createTestHub(context);
  const { intake } = await publishSkill(fixture);
  const guest = httpClient(fixture);
  const route = `/api/versions/${intake.version_id}/archive`;
  const downloads = async () =>
    (await fixture.store.all('audit')).filter((event) => event.action === 'content.download');
  const read = context.mock.method(fixture.blobs, 'read', () =>
    Promise.reject(new Error('fixture storage unavailable')),
  );
  assertFailure(await guest.get(route), 500, 'INTERNAL_ERROR');
  assert.deepEqual(await downloads(), []);
  read.mock.restore();
  const response = await guest.get(route).expect(200);
  assert.equal(response.headers['content-type'], 'application/zip');
  assert.equal((await downloads()).length, 1);
  await fixture.hub.lifecycle.revokeVersion(fixture.admin, intake.version_id, '撤回版本');
  assertFailure(await guest.get(route), 404, 'NOT_FOUND');
  assert.equal((await downloads()).length, 1);
});
