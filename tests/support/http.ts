import assert from 'node:assert/strict';
import request from 'supertest';
import type { TestHub } from './application.js';
import { testPassword } from './application.js';

export function httpClient(fixture: TestHub) {
  return request
    .agent(fixture.app)
    .set('Host', new URL(fixture.config.publicUrl).host)
    .set('Origin', fixture.config.publicUrl);
}

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
