import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { sha256 } from '@capability-hub/domain/canonical';
import { test } from 'node:test';
import { createTestHub, type TestHub } from '../support/application.js';
import { httpClient, signIn } from '../support/http.js';

async function requestAuthorization(fixture: TestHub, scope = 'hub:read') {
  const http = httpClient(fixture);
  const verifier = randomBytes(32).toString('base64url');
  const client = (
    await http
      .post('/oauth/register')
      .send({
        client_name: '测试 Agent',
        redirect_uris: ['http://127.0.0.1/callback'],
        token_endpoint_auth_method: 'none',
      })
      .expect(201)
  ).body;
  const query = {
    client_id: client.client_id,
    response_type: 'code',
    redirect_uri: 'http://127.0.0.1:43123/callback',
    resource: fixture.config.publicUrl + '/mcp',
    state: 'user-state',
    scope,
    code_challenge_method: 'S256',
    code_challenge: createHash('sha256').update(verifier).digest('base64url'),
  };
  const started = await http.get('/oauth/authorize').query(query).expect(302);
  const id = new URL(started.headers.location as string, fixture.config.publicUrl).searchParams.get(
    'authorization',
  )!;
  return { http, verifier, client, query, id };
}

async function grant(fixture: TestHub, contribute = false, username = 'owner') {
  const flow = await requestAuthorization(
    fixture,
    contribute ? 'hub:read hub:contribute' : 'hub:read',
  );
  const browser = await signIn(fixture, username);
  const decision = await browser
    .post('/api/connections/authorize/' + flow.id)
    .send({ allow: true, contribute })
    .expect(200);
  const callback = new URL(decision.body.redirect_uri as string);
  assert.equal(callback.searchParams.get('state'), 'user-state');
  assert.equal(callback.searchParams.get('iss'), fixture.config.publicUrl);
  const exchange = {
    grant_type: 'authorization_code',
    client_id: flow.client.client_id,
    redirect_uri: flow.query.redirect_uri,
    code_verifier: flow.verifier,
    code: callback.searchParams.get('code'),
    resource: flow.query.resource,
  };
  const issued = await flow.http.post('/oauth/token').type('form').send(exchange).expect(200);
  return { ...flow, browser, exchange, tokens: issued.body };
}

const rpc = { jsonrpc: '2.0', id: 1, method: 'tools/list' };

test('OAuth 元数据、浏览器登录与 CSRF 确认、默认读取、MCP 专用凭据和撤销形成闭环', async (context) => {
  const fixture = await createTestHub(context);
  const http = httpClient(fixture);
  const discovery = await http.get('/.well-known/oauth-protected-resource/mcp').expect(200);
  assert.deepEqual(discovery.body.authorization_servers, [fixture.config.publicUrl]);
  const metadata = await http.get('/.well-known/oauth-authorization-server').expect(200);
  assert.deepEqual(metadata.body.code_challenge_methods_supported, ['S256']);
  const flow = await requestAuthorization(fixture);
  await http
    .post('/api/connections/authorize/' + flow.id)
    .send({ allow: true })
    .expect(401);
  const browser = await signIn(fixture);
  await browser
    .post('/api/connections/authorize/' + flow.id)
    .set('X-CSRF-Token', 'wrong')
    .send({ allow: true })
    .expect(403);
  const detail = await browser.get('/api/connections/authorize/' + flow.id).expect(200);
  assert.equal(detail.body.client_name, '测试 Agent');
  assert.equal(detail.body.code, undefined);
  const flow2 = await grant(fixture);
  assert.equal(flow2.tokens.scope, 'hub:read');
  await http
    .get('/api/me')
    .set('Authorization', 'Bearer ' + flow2.tokens.access_token)
    .expect(403);
  await http
    .post('/api/tokens')
    .set('Authorization', 'Bearer ' + flow2.tokens.access_token)
    .send({ name: 'bad' })
    .expect(403);
  await http
    .post('/mcp')
    .set('Authorization', 'Bearer ' + flow2.tokens.refresh_token)
    .send(rpc)
    .expect(401);
  const list = await flow2.browser.get('/api/connections').expect(200);
  assert.equal(list.body.length, 1);
  assert.equal(list.body[0].last_used_at !== null, true);
  await flow2.browser.delete('/api/connections/' + list.body[0].id).expect(200);
  await http
    .post('/mcp')
    .set('Authorization', 'Bearer ' + flow2.tokens.access_token)
    .send(rpc)
    .expect(401);
  await http
    .post('/oauth/token')
    .send({
      grant_type: 'refresh_token',
      client_id: flow2.client.client_id,
      refresh_token: flow2.tokens.refresh_token,
      resource: flow2.query.resource,
    })
    .expect(400);
  assert.deepEqual(await fixture.hub.tokens.list(fixture.admin.id), []);
});

test('OAuth 拒绝错误回调、PKCE、资源与客户端；授权码一次消费且并发重放撤销授权', async (context) => {
  const fixture = await createTestHub(context);
  const flow = await requestAuthorization(fixture);
  for (const patch of [
    { redirect_uri: 'https://attacker.example/callback' },
    { redirect_uri: 'http://127.0.0.1:41111/other' },
    { resource: 'https://attacker.example/mcp' },
    { code_challenge_method: 'plain' },
    { scope: 'admin' },
  ])
    await flow.http
      .get('/oauth/authorize')
      .query({ ...flow.query, ...patch })
      .expect(400);
  await flow.http
    .post('/oauth/register')
    .send({ redirect_uris: ['javascript:alert(1)'] })
    .expect(400);
  const browser = await signIn(fixture);
  const decision = await browser
    .post('/api/connections/authorize/' + flow.id)
    .send({ allow: true })
    .expect(200);
  const code = new URL(decision.body.redirect_uri as string).searchParams.get('code');
  const input = {
    grant_type: 'authorization_code',
    client_id: flow.client.client_id,
    code,
    code_verifier: flow.verifier,
    redirect_uri: flow.query.redirect_uri,
    resource: flow.query.resource,
  };
  for (const patch of [
    { code_verifier: 'x'.repeat(43) },
    { client_id: 'other-client' },
    { redirect_uri: 'http://127.0.0.1:43124/callback' },
    { resource: 'https://other.example/mcp' },
  ])
    await flow.http
      .post('/oauth/token')
      .send({ ...input, ...patch })
      .expect(400);
  const results = await Promise.all([
    flow.http.post('/oauth/token').send(input),
    flow.http.post('/oauth/token').send(input),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 400]);
  const issued = results.find((r) => r.status === 200)!.body;
  assert.equal(await fixture.hub.oauth.authenticate(issued.access_token as string), null);
});

test('刷新轮换保持授权范围，旧刷新令牌重放会撤销整个连接', async (context) => {
  const fixture = await createTestHub(context);
  const flow = await grant(fixture);
  const input = {
    grant_type: 'refresh_token',
    client_id: flow.client.client_id,
    refresh_token: flow.tokens.refresh_token,
    resource: flow.query.resource,
  };
  await flow.http
    .post('/oauth/token')
    .send({ ...input, scope: 'hub:contribute' })
    .expect(400);
  const refreshed = await flow.http.post('/oauth/token').send(input).expect(200);
  assert.notEqual(refreshed.body.refresh_token, flow.tokens.refresh_token);
  assert.equal(refreshed.body.scope, 'hub:read');
  assert(await fixture.hub.oauth.authenticate(refreshed.body.access_token as string));
  await flow.http.post('/oauth/token').send(input).expect(400);
  assert.equal(await fixture.hub.oauth.authenticate(refreshed.body.access_token as string), null);
});

test('取消与过期授权不签发凭据，授权列表按当前账号隔离', async (context) => {
  const fixture = await createTestHub(context);
  const flow = await requestAuthorization(fixture, 'hub:read hub:contribute');
  const browser = await signIn(fixture);
  const cancelled = await browser
    .post('/api/connections/authorize/' + flow.id)
    .send({ allow: false })
    .expect(200);
  assert.equal(
    new URL(cancelled.body.redirect_uri as string).searchParams.get('error'),
    'access_denied',
  );
  await assert.rejects(fixture.hub.oauth.describe(flow.id));
  const other = await requestAuthorization(fixture);
  const row = (await fixture.store.get('oauth_requests', other.id))!;
  await fixture.store.put('oauth_requests', { ...row, expires_at: Date.now() - 1 });
  await assert.rejects(fixture.hub.oauth.decide(fixture.admin, other.id, true, false));
  const issued = await grant(fixture, true);
  assert.equal(issued.tokens.scope, 'hub:read hub:contribute');
  const reader = await signIn(fixture, 'reader');
  const list = await browser.get('/api/connections').expect(200);
  assert.deepEqual((await reader.get('/api/connections').expect(200)).body, []);
  await reader.delete('/api/connections/' + list.body[0].id).expect(404);
});

test('OAuth 跨源仅开放无 Cookie 的协议接口，停用账号后重新启用不恢复授权', async (context) => {
  const fixture = await createTestHub(context);
  const flow = await grant(fixture, false, 'reader');
  const cors = await flow.http
    .options('/oauth/token')
    .set('Origin', 'https://client.example')
    .expect(204);
  assert.equal(cors.headers['access-control-allow-origin'], '*');
  assert.equal(cors.headers['access-control-allow-credentials'], undefined);
  await flow.http.get('/api/connections').set('Origin', 'https://client.example').expect(403);
  const current = (await fixture.store.get('users', fixture.reader.id))!;
  await fixture.hub.administration.updateUser(
    fixture.admin,
    current.id,
    { active: false },
    '"' + current.revision + '"',
  );
  assert.equal(await fixture.hub.oauth.authenticate(flow.tokens.access_token as string), null);
  await fixture.hub.administration.updateUser(
    fixture.admin,
    current.id,
    { active: true },
    '"' + (current.revision + 1) + '"',
  );
  assert.equal(await fixture.hub.oauth.authenticate(flow.tokens.access_token as string), null);
});

test('停用账号永久作废已批准但尚未兑换的 OAuth 与 CLI 登录', async (context) => {
  const fixture = await createTestHub(context);
  const flow = await requestAuthorization(fixture);
  const principal = await fixture.hub.identity.principal(fixture.reader.id);
  const decision = await fixture.hub.oauth.decide(principal, flow.id, true, false);
  const verifier = 'v'.repeat(43);
  const login = await fixture.hub.cliLogin.request({ challenge: sha256(verifier) });
  await fixture.hub.cliLogin.approve(principal, { code: login.user_code });
  const current = (await fixture.store.get('users', fixture.reader.id))!;
  for (const [index, active] of [false, true].entries()) {
    await fixture.hub.administration.updateUser(
      fixture.admin,
      current.id,
      { active },
      '"' + (current.revision + index) + '"',
    );
  }
  const response = await flow.http
    .post('/oauth/token')
    .send({
      grant_type: 'authorization_code',
      client_id: flow.client.client_id,
      code: new URL(decision.redirect_uri).searchParams.get('code'),
      redirect_uri: flow.query.redirect_uri,
      code_verifier: flow.verifier,
      resource: flow.query.resource,
    })
    .expect(400);
  assert.equal(response.body.error, 'invalid_grant');
  await assert.rejects(
    fixture.hub.cliLogin.poll({ device_code: login.device_code, verifier }),
    /授权已使用/,
  );
  assert.deepEqual(await fixture.hub.tokens.list(current.id), []);
  assert.deepEqual(await fixture.hub.oauth.list(current.id), []);
});

test('回调严格匹配原字符串，仅 IP loopback 放宽端口；拒绝预置协议参数', async (context) => {
  const fixture = await createTestHub(context);
  const flow = await requestAuthorization(fixture);
  for (const redirect_uri of [
    'http://127.0.0.1:4321/x/../callback',
    'http://127.0.0.1:4321/%63allback',
    'http://127.0.0.1:4321/callback#',
  ]) {
    await flow.http
      .get('/oauth/authorize')
      .query({ ...flow.query, redirect_uri })
      .expect(400);
  }
  for (const suffix of ['?code=old', '?state=old', '?error=old', '?iss=old', '#']) {
    await flow.http
      .post('/oauth/register')
      .send({ redirect_uris: ['https://client.example/callback' + suffix] })
      .expect(400);
  }
  const registered = await fixture.hub.oauth.register({
    redirect_uris: ['https://client.example/callback'],
  });
  for (const redirect_uri of [
    'https://CLIENT.example/callback',
    'https://client.example:443/callback',
    'https://client.example/x/../callback',
  ]) {
    await flow.http
      .get('/oauth/authorize')
      .query({ ...flow.query, client_id: registered.client_id, redirect_uri })
      .expect(400);
  }
  await flow.http
    .get('/oauth/authorize')
    .query({ ...flow.query, redirect_uri: 'http://127.0.0.1:52341/callback' })
    .expect(302);
});

test('匿名注册限流不会耗尽刷新端点的独立额度', async (context) => {
  const fixture = await createTestHub(context);
  const flow = await grant(fixture);
  for (let index = 0; index < 30; index++) await flow.http.post('/oauth/register').send({});
  await flow.http.post('/oauth/register').send({}).expect(429);
  await flow.http.post('/oauth/REGISTER/').send({}).expect(429);
  await flow.http
    .post('/oauth/token')
    .send({
      grant_type: 'refresh_token',
      client_id: flow.client.client_id,
      refresh_token: flow.tokens.refresh_token,
      resource: flow.query.resource,
    })
    .expect(200);
});
