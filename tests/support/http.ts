import assert from 'node:assert/strict';
import request from 'supertest';
import type { TestHub } from './application.js';
import { testPassword } from './application.js';

/**
 * 带正确 `Host`/`Origin` 的 supertest agent：这两项必须与 `publicUrl` 一致，否则 CSRF 与
 * Origin 校验会先拒绝请求。agent 会保留 cookie，因此同一实例可跨请求维持会话。
 */
export function httpClient(fixture: TestHub) {
  return request
    .agent(fixture.app)
    .set('Host', new URL(fixture.config.publicUrl).host)
    .set('Origin', fixture.config.publicUrl);
}

/**
 * 登录并取回 CSRF 令牌挂到 agent 上，返回后续请求可复用的客户端。
 * 口令统一用 {@link testPassword}；令牌从 `/api/me` 读而不是解析 cookie，避免和 cookie 名耦合。
 */
export async function signIn(fixture: TestHub, username = 'owner') {
  const client = httpClient(fixture);
  await client.post('/auth/login').send({ username, password: testPassword }).expect(200);
  const response = await client.get('/api/me').expect(200);
  const csrf: unknown = response.body.csrf_token;
  assert.equal(typeof csrf, 'string');
  assert(csrf);
  client.set('X-CSRF-Token', String(csrf));
  return client;
}
