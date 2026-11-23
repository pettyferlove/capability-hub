import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { test } from 'node:test';
import { sha256 } from '@capability-hub/domain/canonical';
import type { TableName } from '@capability-hub/domain/models';
import { archive } from '@capability-hub/infrastructure/content/zip-archive';
import type { Agent } from 'supertest';
import { createTestHub, publishSkill, testPassword } from '../support/application.js';
import { httpClient, signIn } from '../support/http.js';
import { skillDocument } from '../support/content.js';
import { serveTestHub } from '../support/server.js';
import { deferred } from '../support/store.js';

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

function bundlePath(...ids: string[]) {
  return '/api/catalog/skill-bundle?' + new URLSearchParams(ids.map((id) => ['version_id', id]));
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

test('直连设备码签发按对端限额，未受信的转发头不改变来源且轮询不占额度', async (context) => {
  const fixture = await createTestHub(context, { trustedProxyAddresses: [] });
  const http = httpClient(fixture);
  context.mock.timers.enable({ apis: ['Date'], now: Date.now() });
  const verifier = randomBytes(32).toString('base64url');
  const input = { challenge: sha256(verifier) };
  const request = () => http.post('/auth/cli/request').send(input);
  const first = await request().expect(200);
  for (let index = 1; index < 6; index++) await request().expect(200);
  const limited = await http
    .post('/auth/cli/request')
    .set('X-Forwarded-For', '192.0.2.1')
    .send(input);
  assertFailure(limited, 429, 'CLI_LOGIN_RATE_LIMIT');
  assert.equal(limited.headers['retry-after'], '60');
  assert.equal((await fixture.store.all('cli_logins')).length, 6);
  const poll = await http
    .post('/auth/cli/poll')
    .send({ device_code: first.body.device_code, verifier })
    .expect(200);
  assert.equal(poll.body.state, 'pending');
  context.mock.timers.tick(60_000);
  await request().expect(200);
});

test('受信代理区分来源，设备码签发仍受进程总额度约束', async (context) => {
  const fixture = await createTestHub(context, { trustedProxyAddresses: ['127.0.0.1', '::1'] });
  const http = httpClient(fixture);
  context.mock.timers.enable({ apis: ['Date'], now: Date.now() });
  const request = (source: number) =>
    http
      .post('/auth/cli/request')
      .set('X-Forwarded-For', `192.0.2.${source}`)
      .send({ challenge: sha256(randomUUID()) });
  for (let index = 0; index < 6; index++) await request(1).expect(200);
  assertFailure(await request(1), 429, 'CLI_LOGIN_RATE_LIMIT');
  for (let index = 6; index < 60; index++) await request(1 + Math.floor(index / 6)).expect(200);
  assertFailure(await request(11), 429, 'CLI_LOGIN_RATE_LIMIT');
  assert.equal((await fixture.store.all('cli_logins')).length, 60);
});

test('Bearer 只访问消费接口，不能读取个人管理资料；失效凭据不会降级为匿名读取', async (context) => {
  const fixture = await createTestHub(context);
  const token = await fixture.hub.tokens.issue(fixture.admin, { name: '只读工具' });
  const client = httpClient(fixture).set('Authorization', 'Bearer ' + token.token);
  await client.get('/api/me').expect(200);
  await client.get('/api/assets').expect(200);
  const { intake } = await publishSkill(fixture, {
    distribution: { mode: 'approved_audience', audience: ['organization'] },
  });
  const asset = `/api/assets/${intake.asset_id}`;
  const version = `/api/versions/${intake.version_id}`;
  for (const path of [
    '/api/catalog/keywords',
    '/api/scenarios',
    asset,
    `${asset}/versions`,
    `${asset}/versions/${intake.version_id}`,
    `${version}/manifest`,
    `${version}/files?path=SKILL.md`,
  ])
    await client.get(path).expect(200);
  await client.head(`${version}/archive`).expect(200);
  assertFailure(await client.get(`${version}/mcp-options`), 422, 'NOT_MCP');
  const session = await signIn(fixture);
  const feedbackPath = `${asset}/feedback`;
  await (
    await signIn(fixture, 'reader')
  )
    .post('/api/feedback')
    .send({
      version_id: intake.version_id,
      idempotency_key: randomUUID(),
      consent: true,
      kind: 'defect',
      title: '导入失败',
      scenario: '导入示例数据',
      expected: '完成导入',
      actual: '缺少列说明',
    })
    .expect(200);
  const feedback = await session.get(feedbackPath).expect(200);
  assert.equal(feedback.body.items[0].title, '导入失败');
  assertFailure(await client.get(feedbackPath), 403, 'TOKEN_SCOPE');
  await client.head(feedbackPath).expect(403);
  assertFailure(await client.get('/api/me/profile'), 403, 'TOKEN_SCOPE');
  assertFailure(await client.get('/api/admin/identity'), 403, 'TOKEN_SCOPE');
  const guest = httpClient(fixture);
  for (const path of [
    '/api/admin/operations/agents/catalog',
    '/api/admin/operations/agents/executions',
    '/api/admin/operations/agents/executions/run/diagnostics',
  ]) {
    assertFailure(await guest.get(path), 401, 'UNAUTHENTICATED');
    assertFailure(await client.get(path), 403, 'TOKEN_SCOPE');
  }
  assertFailure(await client.post('/api/tokens').send({ name: '拒绝写入' }), 403, 'TOKEN_SCOPE');
  await fixture.hub.tokens.revoke(fixture.admin.id, sha256(token.token));
  assertFailure(await client.get('/api/assets'), 401, 'UNAUTHENTICATED');
  assertFailure(
    await httpClient(fixture).get('/api/assets').set('Authorization', 'Basic invalid'),
    401,
    'UNAUTHENTICATED',
  );
});

test('只读个人令牌只能通过精确允许的路径提交和跟进本人平台反馈', async (context) => {
  const fixture = await createTestHub(context);
  const tokenName = '终端反馈';
  const token = await fixture.hub.tokens.issue(fixture.reader, {
    name: tokenName,
    scope: 'hub:read',
  });
  const reader = httpClient(fixture).set('Authorization', `Bearer ${token.token}`);
  const admin = await signIn(fixture);
  const self = '/api/hub-feedback';
  const contents = 'Steps to reproduce the issue';
  const create = (client: Agent) =>
    client
      .post(self)
      .set('Idempotency-Key', randomUUID())
      .field(
        'metadata',
        JSON.stringify({
          kind: 'bug',
          surface: 'cli',
          title: 'CLI command does not finish',
          description: contents,
          files: [{ part: 0, kind: 'text', name: 'steps.txt' }],
        }),
      )
      .attach('files', Buffer.from(contents), 'steps.txt')
      .expect(201);
  const created = await create(reader);
  const other = await create(admin);
  const id: string = created.body.id;
  const aid: string = created.body.attachments[0].id;
  const detail = `${self}/${id}`;
  const file = `${detail}/attachments/${aid}`;

  const processed = await admin.get(`/api/admin/hub-feedback/${id}`).expect(200);
  assert.equal(processed.body.channel, 'cli');
  assert.equal(processed.body.submission.credential_type, 'personal_token');
  assert.equal(processed.body.submission.token_name, tokenName);
  assert.equal(processed.body.submission.request_id, created.headers['x-request-id']);
  const listed = await reader.get(`${self}?page=1`).expect(200);
  assert.deepEqual(
    listed.body.items.map((item: { id: string }) => item.id),
    [id],
  );
  assert.deepEqual((await reader.get(`${self}/summary`).expect(200)).body, { unread: 0, open: 1 });
  assert.equal((await reader.get(detail).expect(200)).body.id, id);
  assert.equal((await reader.get(`${self}/${created.body.number}`).expect(200)).body.id, id);
  assert.equal((await reader.get(file).expect(200)).text, contents);
  assertFailure(await reader.get(`${self}/2147483647`), 404, 'NOT_FOUND');

  const update = (path: string, etag: string) =>
    reader.post(path).set('If-Match', etag).set('Idempotency-Key', randomUUID());
  const updateText = 'The same issue occurs after reconnecting';
  const commented = await update(`${detail}/comments`, created.headers.etag)
    .field('metadata', JSON.stringify({ body: updateText }))
    .expect(200);
  assert.equal(commented.body.events[0].body, updateText);
  const read = await update(`${detail}/read`, commented.headers.etag).expect(200);
  const closed = await update(`${detail}/close`, read.headers.etag).expect(200);
  assert.equal(closed.body.status, 'resolved');

  const otherDetail = `${self}/${other.body.id}`;
  for (const path of [
    otherDetail,
    `${self}/${other.body.number}`,
    `${otherDetail}/attachments/${other.body.attachments[0].id}`,
  ]) {
    assertFailure(await reader.get(path), 404, 'NOT_FOUND');
  }
  for (const action of ['comments', 'close', 'read']) {
    const request = update(`${otherDetail}/${action}`, other.headers.etag);
    if (action === 'comments') request.field('metadata', JSON.stringify({ body: updateText }));
    assertFailure(await request, 404, 'NOT_FOUND');
  }

  for (const path of [self, detail, file, `${self}/summary`]) {
    await reader.head(path).expect(403);
  }
  for (const [method, path] of [
    ['options', self],
    ['delete', file],
    ['patch', detail],
    ['post', detail],
    ['post', `${self}/summary`],
    ['post', `${self}/summary/read`],
    ['post', `${self}/${created.body.number}/comments`],
    ['post', `${detail}/read/`],
    ['get', `${detail}/comments`],
    ['get', `${self}/`],
    ['get', `${self}-other`],
    ['get', `${self}/summary/`],
    ['get', `${self}/%73ummary`],
    ['get', `${detail}/`],
    ['get', `${self}/${id.replace('-', '%2D')}`],
    ['get', `${detail}/attachments/${aid.replace('-', '%2D')}`],
    ['get', `${detail}/attachments/${created.body.number}`],
    ['get', `${self}/${created.body.number}/attachments/${aid}`],
    ['get', `${self}/12345678-1234-1234-1234-123456789abc`],
    ['get', `${self}/0`],
    ['get', `${self}/0${created.body.number}`],
    ['get', `${self}/2147483648`],
    ['get', `${self}/1.0`],
    ['get', '/api/HUB-feedback'],
  ] as const) {
    const rejected = await reader[method](path);
    assertFailure(rejected, 403, 'TOKEN_SCOPE');
    assert.match(rejected.headers['www-authenticate'], /^Bearer /);
  }
});

test('OAuth 连接即使有贡献权限也只能用于 MCP，不能访问平台反馈', async (context) => {
  const fixture = await createTestHub(context);
  const { oauth } = fixture.hub;
  const redirectUri = 'http://127.0.0.1/callback';
  const resource = fixture.config.publicUrl + '/mcp';
  const verifier = randomBytes(32).toString('base64url');
  const { client_id } = await oauth.register({ redirect_uris: [redirectUri] });
  const request = await oauth.begin({
    client_id,
    redirect_uri: redirectUri,
    resource,
    response_type: 'code',
    scope: 'hub:read hub:contribute',
    code_challenge_method: 'S256',
    code_challenge: createHash('sha256').update(verifier).digest('base64url'),
  });
  const decision = await oauth.decide(fixture.admin, request, true, true);
  const tokens = await oauth.exchange({
    grant_type: 'authorization_code',
    client_id,
    redirect_uri: redirectUri,
    resource,
    code: new URL(decision.redirect_uri).searchParams.get('code'),
    code_verifier: verifier,
  });
  const client = httpClient(fixture).set('Authorization', `Bearer ${tokens.access_token}`);
  await client
    .post('/mcp')
    .set('Accept', 'application/json, text/event-stream')
    .set('MCP-Protocol-Version', '2025-11-25')
    .send({ jsonrpc: '2.0', id: 1, method: 'tools/list' })
    .expect(200);

  const self = '/api/hub-feedback';
  const detail = `${self}/${randomUUID()}`;
  for (const [method, path] of [
    ['get', self],
    ['get', `${self}/summary`],
    ['get', `${self}/1`],
    ['get', detail],
    ['get', `${detail}/attachments/${randomUUID()}`],
    ['post', self],
    ['post', `${detail}/comments`],
    ['post', `${detail}/close`],
    ['post', `${detail}/read`],
    ['get', '/api/admin/hub-feedback'],
  ] as const) {
    assertFailure(await client[method](path), 403, 'TOKEN_SCOPE');
  }
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
  assert(
    guide.text.includes(
      `capability-hub add 'sample-skill' --version '1.0.0' --url '${fixture.config.publicUrl}' --to '<技能父目录>' --dry-run`,
    ),
  );
  assert(guide.text.includes(version.artifact_digest));
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

test('Skill 合包按固定版本交付完整目录、文件字节和执行位，逐版本记下载审计', async (context) => {
  const fixture = await serveTestHub(context);
  const firstFiles = [
    { path: 'SKILL.md', bytes: skillDocument('first-skill', '第一版'), executable: false },
    { path: 'scripts/show.sh', bytes: Buffer.from('#!/bin/sh\npwd\n'), executable: true },
  ];
  const first = await publishSkill(fixture, {
    slug: 'first-skill',
    files: firstFiles.map((file) => ({ ...file, path: `upstream/${file.path}` })),
  });
  await publishSkill(fixture, {
    slug: 'first-skill',
    assetId: first.intake.asset_id,
    version: '2.0.0',
    body: '第二版',
  });
  const second = await publishSkill(fixture, { slug: 'second-skill' });
  const selected = [second.intake.version_id, first.intake.version_id];
  const response = await fetch(fixture.origin + bundlePath(...selected));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'application/zip');
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.equal(
    response.headers.get('content-disposition'),
    'attachment; filename="capability-hub-skills.zip"',
  );
  const expected = await archive([
    ...firstFiles.map((file) => ({ ...file, path: `first-skill/${file.path}` })),
    { path: 'second-skill/SKILL.md', bytes: skillDocument('second-skill'), executable: false },
  ]);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), expected);
  const events = await fixture.store.where('audit', 'action', 'content.download');
  assert.deepEqual(events.map((event) => event.entity_id).sort(), selected.sort());
  assert(events.every((event) => event.actor_id === 'anonymous'));
});

test('Skill 合包不越过当前及历史受众，不接受重复资源或借用个人令牌', async (context) => {
  const fixture = await createTestHub(context);
  const organization = { mode: 'approved_audience' as const, audience: ['organization'] };
  const first = await publishSkill(fixture);
  const org = await publishSkill(fixture, {
    assetId: first.intake.asset_id,
    version: '2.0.0',
    body: '组织发布',
    distribution: organization,
  });
  const second = await publishSkill(fixture, { slug: 'second-skill', distribution: organization });
  const open = await publishSkill(fixture, {
    slug: 'second-skill',
    assetId: second.intake.asset_id,
    version: '2.0.0',
    body: '公开发布',
  });
  const route = bundlePath(open.intake.version_id, first.intake.version_id);
  const guest = httpClient(fixture);
  assertFailure(await guest.get(route), 404, 'NOT_FOUND');
  assertFailure(await guest.get(bundlePath(second.intake.version_id)), 404, 'NOT_FOUND');
  const reader = await signIn(fixture, 'reader');
  await reader.get(bundlePath(open.intake.version_id, open.intake.version_id)).expect(422);
  assertFailure(
    await reader.get(bundlePath(first.intake.version_id, org.intake.version_id)),
    422,
    'SKILL_BUNDLE_CONFLICT',
  );
  const token = await fixture.hub.tokens.issue(fixture.reader, { name: '只读工具' });
  assertFailure(
    await guest.get(route).set('Authorization', 'Bearer ' + token.token),
    403,
    'TOKEN_SCOPE',
  );
  await reader.head(route).expect('Allow', 'GET').expect(405);
  assert.deepEqual(await fixture.store.where('audit', 'action', 'content.download'), []);
  await reader.get(route).expect('Content-Type', 'application/zip').expect(200);
  const events = await fixture.store.where('audit', 'action', 'content.download');
  assert.deepEqual(
    events.map((event) => event.actor_id),
    [fixture.reader.id, fixture.reader.id],
  );
});

test('Skill 合包准备期间撤销会话或任一版本，不交付归档也不保留部分审计', async (context) => {
  const fixture = await createTestHub(context);
  const first = await publishSkill(fixture);
  const second = await publishSkill(fixture, { slug: 'second-skill' });
  const route = bundlePath(first.intake.version_id, second.intake.version_id);
  const reader = await signIn(fixture, 'reader');
  const read = fixture.blobs.read.bind(fixture.blobs);
  for (const change of ['session', 'release'] as const) {
    context.mock.method(
      fixture.blobs,
      'read',
      async (hash: string) => {
        const bytes = await read(hash);
        if (change === 'session') await fixture.hub.sessions.revokeAll(fixture.reader.id);
        else
          await fixture.hub.lifecycle.revokeVersion(
            fixture.admin,
            second.intake.version_id,
            '撤销版本',
          );
        return bytes;
      },
      { times: 1 },
    );
    const result = await reader.get(route);
    if (change === 'session') assertFailure(result, 401, 'UNAUTHENTICATED');
    else assertFailure(result, 404, 'NOT_FOUND');
    assert.deepEqual(await fixture.store.where('audit', 'action', 'content.download'), []);
  }
});

test('Skill 合包先按整批解压字节数拒绝超限请求，提示分批且不读取内容', async (context) => {
  const fixture = await createTestHub(context);
  const first = await publishSkill(fixture);
  const second = await publishSkill(fixture, { slug: 'second-skill' });
  const get = fixture.store.get.bind(fixture.store);
  context.mock.method(fixture.store, 'get', async (table: TableName, id: string) => {
    if (table !== 'versions') return await get(table, id);
    const version = await get('versions', id);
    assert(version);
    // 每包五个 10 MiB 的对象只提供存储索引；若提前读取不存在的对象便会返回 503。
    const files = Array.from({ length: 5 }, (_, i) => ({
      ...version.files[0],
      path: `assets/${i}.bin`,
      size: 10 * 1024 * 1024,
      blob_ref: '0'.repeat(64),
      sha256: '0'.repeat(64),
    }));
    return { ...version, files: [...version.files, ...files] };
  });
  const path = bundlePath(first.intake.version_id, second.intake.version_id);
  const result = await httpClient(fixture).get(path);
  assertFailure(result, 413, 'SKILL_BUNDLE_TOO_LARGE');
  assert.match(result.body.error.message, /分批/);
  assert.deepEqual(await fixture.store.where('audit', 'action', 'content.download'), []);
});

test('Skill 合包只同时处理两份，额外请求不排队，存储失败后释放名额', async (context) => {
  const fixture = await createTestHub(context);
  const { intake } = await publishSkill(fixture);
  const path = bundlePath(intake.version_id);
  const full = deferred();
  const release = deferred();
  let readers = 0;
  const blocked = context.mock.method(fixture.blobs, 'read', async () => {
    if (++readers === 2) full.resolve();
    await release.promise;
    throw new Error('fixture storage unavailable');
  });
  const pending = Promise.all(
    Array.from({ length: 2 }, () => httpClient(fixture).get(path).timeout(10000).expect(500)),
  );
  try {
    await Promise.race([full.promise, pending]);
    const busy = await httpClient(fixture).get(path).timeout(3000);
    assertFailure(busy, 429, 'SKILL_BUNDLE_BUSY');
    assert.equal(busy.body.error.retryable, true);
  } finally {
    release.resolve();
    await pending;
    blocked.mock.restore();
  }
  assert.deepEqual(await fixture.store.where('audit', 'action', 'content.download'), []);
  await httpClient(fixture).get(path).expect(200);
});

test('取消合包会中止存储读取，收尾前仍占名额，收尾后不再读取下一项或记下载', async (context) => {
  const fixture = await serveTestHub(context);
  const first = await publishSkill(fixture);
  const second = await publishSkill(fixture, { slug: 'second-skill' });
  const url = fixture.origin + bundlePath(first.intake.version_id, second.intake.version_id);
  const started = deferred<AbortSignal | undefined>();
  const occupied = deferred();
  const release = deferred();
  const reads: (AbortSignal | undefined)[] = [];
  const read = fixture.blobs.read.bind(fixture.blobs);
  context.mock.method(fixture.blobs, 'read', async (hash: string, signal?: AbortSignal) => {
    reads.push(signal);
    if (reads.length === 1) started.resolve(signal);
    if (reads.length === 2) occupied.resolve();
    // 模拟已经开始、只能等待结束的 I/O；返回有效字节也不能让被取消的合包继续。
    await release.promise;
    return await read(hash);
  });
  const client = new AbortController();
  const cancelled = fetch(url, { signal: client.signal });
  let live: Promise<Response> | undefined;
  try {
    const signal = await Promise.race([
      started.promise,
      cancelled.then(() => assert.fail('合包未读取内容')),
    ]);
    assert(signal);
    live = fetch(url);
    await Promise.race([occupied.promise, live.then(() => assert.fail('第二份合包未开始读取'))]);
    const disconnected = once(signal, 'abort', { signal: AbortSignal.timeout(5000) });
    client.abort();
    await assert.rejects(cancelled, { name: 'AbortError' });
    await disconnected;
    assertFailure(
      await httpClient(fixture).get(bundlePath(first.intake.version_id)).timeout(3000),
      429,
      'SKILL_BUNDLE_BUSY',
    );
    release.resolve();
    const response = await live;
    assert.equal(response.status, 200);
    await response.arrayBuffer();
    assert.equal(reads.filter((reader) => reader === signal).length, 1);
    const audit = await fixture.store.where('audit', 'action', 'content.download');
    assert.deepEqual(
      audit.map((event) => event.entity_id).sort(),
      [first.intake.version_id, second.intake.version_id].sort(),
    );
  } finally {
    client.abort();
    release.resolve();
    await Promise.allSettled([cancelled, live]);
  }
});
