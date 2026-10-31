import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash, randomBytes } from 'node:crypto';
import { OAuthService, IdentityService } from '@capability-hub/application';
import { openRecordStore, snapshotStore, restoreStore } from '@capability-hub/infrastructure/store';
import { externalDatabase } from '../support/external.js';
import { createTestHub } from '../support/application.js';
import { createSqliteStore } from '../support/store.js';

test('PostgreSQL 跨连接 OAuth 一次兑换、刷新重放撤销及 SQLite 快照恢复', async (context) => {
  const database = await externalDatabase();
  const fixture = await createTestHub(context, {
    database: { driver: 'postgresql', url: database.url, poolSize: 4 },
  });
  const poolErrors: Error[] = [];
  const second = await openRecordStore({
    driver: 'postgresql',
    url: database.url,
    onPoolError: (error) => poolErrors.push(error),
  });
  try {
    const oauth = new OAuthService(second, new IdentityService(second), fixture.config.publicUrl);
    const verifier = randomBytes(32).toString('base64url');
    const client = await fixture.hub.oauth.register({
      redirect_uris: ['http://127.0.0.1/callback'],
    });
    const id = await fixture.hub.oauth.begin({
      client_id: client.client_id,
      redirect_uri: 'http://127.0.0.1:54321/callback',
      response_type: 'code',
      code_challenge_method: 'S256',
      code_challenge: createHash('sha256').update(verifier).digest('base64url'),
      resource: fixture.config.publicUrl + '/mcp',
    });
    const decision = await oauth.decide(fixture.admin, id, true, false);
    const issued = await oauth.exchange({
      grant_type: 'authorization_code',
      client_id: client.client_id,
      code: new URL(decision.redirect_uri).searchParams.get('code'),
      code_verifier: verifier,
      redirect_uri: 'http://127.0.0.1:54321/callback',
      resource: fixture.config.publicUrl + '/mcp',
    });
    assert(await fixture.hub.oauth.authenticate(issued.access_token));
    const request = {
      grant_type: 'refresh_token',
      client_id: client.client_id,
      refresh_token: issued.refresh_token,
      resource: fixture.config.publicUrl + '/mcp',
    };
    const results = await Promise.allSettled([
      oauth.exchange(request),
      fixture.hub.oauth.exchange(request),
    ]);
    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
    assert.equal(await oauth.authenticate(issued.access_token), null);
    assert.deepEqual(poolErrors, []);
    const snapshot = await snapshotStore(second);
    const sqlite = await createSqliteStore(context);
    await restoreStore(sqlite.store, snapshot);
    assert.deepEqual(await snapshotStore(sqlite.store), snapshot);
    const restored = new OAuthService(
      sqlite.store,
      new IdentityService(sqlite.store),
      fixture.config.publicUrl,
    );
    assert.equal(await restored.authenticate(issued.access_token), null);
  } finally {
    await second.close();
    await fixture.close();
    await database.close();
  }
});
