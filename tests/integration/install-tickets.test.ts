import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { test } from 'node:test';
import { sha256 } from '@capability-hub/domain/canonical';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { z } from 'zod';
import { publishSkill, type TestHub } from '../support/application.js';
import { httpClient } from '../support/http.js';
import {
  assertSingleInstallRedemption,
  issuePersonalInstallTicket,
} from '../support/install-tickets.js';
import { serveTestHub } from '../support/server.js';

const organization = { mode: 'approved_audience' as const, audience: ['organization'] };

test('SQLite 并发兑换只交付一次归档，兑换后仍可读清单', async (context) => {
  await assertSingleInstallRedemption(await serveTestHub(context));
});

test('归档 HEAD 不消费票据，非法票据格式不会误走下载', async (context) => {
  const fixture = await serveTestHub(context);
  const { intake } = await publishSkill(fixture, { distribution: organization });
  const { path } = await issuePersonalInstallTicket(fixture, intake.version_id);
  const http = httpClient(fixture);
  const invalid = await http.get('/api/install-tickets/invalid/archive').expect(404);
  assert.equal(invalid.body.error.code, 'INSTALL_TICKET_INVALID');
  await http
    .head(path + '/archive')
    .expect('Allow', 'GET')
    .expect(405);
  assert.equal((await http.get(path).expect(200)).body.archive_available, true);
  const archive = await fetch(fixture.origin + path + '/archive');
  assert.equal(archive.status, 200);
  await archive.arrayBuffer();
});

async function issueOAuthInstallTicket(fixture: TestHub, versionId: string) {
  const { oauth } = fixture.hub;
  const redirectUri = 'http://127.0.0.1/callback';
  const { client_id } = await oauth.register({ redirect_uris: [redirectUri] });
  const verifier = randomBytes(32).toString('base64url');
  const id = await oauth.begin({
    client_id,
    redirect_uri: redirectUri,
    resource: oauth.resource,
    response_type: 'code',
    code_challenge_method: 'S256',
    code_challenge: createHash('sha256').update(verifier).digest('base64url'),
  });
  const approved = await oauth.decide(fixture.reader, id, true, false);
  const { access_token } = await oauth.exchange({
    grant_type: 'authorization_code',
    client_id,
    redirect_uri: redirectUri,
    resource: oauth.resource,
    code: new URL(approved.redirect_uri).searchParams.get('code'),
    code_verifier: verifier,
  });
  const client = new Client(
    { name: 'install-ticket-test', version: '1.0.0' },
    { versionNegotiation: { mode: { pin: '2026-07-28' } } },
  );
  try {
    await client.connect(
      new StreamableHTTPClientTransport(new URL(oauth.resource), {
        requestInit: { headers: { Authorization: `Bearer ${access_token}` } },
      }),
    );
    const result = await client.callTool({
      name: 'install_skill',
      arguments: { version_id: versionId },
    });
    assert(!result.isError);
    const { download } = z
      .object({ download: z.object({ url: z.url(), single_use: z.literal(true) }) })
      .parse(result.structuredContent);
    const path = new URL(download.url).pathname;
    assert.match(path, /^\/api\/install-tickets\/[A-Za-z0-9_-]{43}\/archive$/);
    return { path: path.slice(0, -'/archive'.length), client_id, access_token };
  } finally {
    await client.close();
  }
}

test('过期、撤权与当前受众变化统一拒绝票据且不记下载审计', async (context) => {
  for (const reason of ['过期', 'OAuth 撤销', '个人令牌撤销', '账号停用', '受众收窄']) {
    await context.test(reason, async (subtest) => {
      subtest.mock.timers.enable({ apis: ['Date'] });
      const fixture = await serveTestHub(subtest);
      const { intake } = await publishSkill(fixture, { distribution: organization });
      const { hub, store, admin, reader } = fixture;
      let path: string;
      if (reason === 'OAuth 撤销') {
        const issued = await issueOAuthInstallTicket(fixture, intake.version_id);
        path = issued.path;
        await httpClient(fixture).get(path).expect(200);
        await hub.oauth.revoke({ client_id: issued.client_id, token: issued.access_token });
      } else {
        const issued = await issuePersonalInstallTicket(fixture, intake.version_id);
        path = issued.path;
        await httpClient(fixture).get(path).expect(200);
        if (reason === '过期') subtest.mock.timers.tick(600_000);
        else if (reason === '个人令牌撤销')
          await hub.tokens.revoke(reader.id, issued.credential.id);
        else if (reason === '账号停用')
          await hub.administration.updateUser(
            admin,
            reader.id,
            { active: false },
            `"${reader.revision}"`,
          );
        else
          await publishSkill(fixture, {
            assetId: intake.asset_id,
            version: '2.0.0',
            distribution: { mode: 'approved_audience', audience: [`group:${fixture.teamId}`] },
          });
      }
      for (const suffix of ['', '/archive']) {
        const denied = await httpClient(fixture)
          .get(path + suffix)
          .expect(404);
        assert.equal(denied.body.error.code, 'INSTALL_TICKET_INVALID');
      }
      const audits = await store.where('audit', 'entity_id', intake.version_id);
      assert.equal(
        audits.some((event) => event.action === 'content.download'),
        false,
      );
    });
  }
});

test('临近到期兑换后，清单仍留足一个有效期供提交前复核，但不能再次兑换', async (context) => {
  context.mock.timers.enable({ apis: ['Date'] });
  const fixture = await serveTestHub(context);
  const { intake } = await publishSkill(fixture, { distribution: organization });
  const { path } = await issuePersonalInstallTicket(fixture, intake.version_id);
  const http = httpClient(fixture);
  context.mock.timers.tick(590_000);
  const archive = await fetch(fixture.origin + path + '/archive');
  assert.equal(archive.status, 200);
  await archive.arrayBuffer();
  context.mock.timers.tick(20_000);
  assert.equal((await http.get(path).expect(200)).body.archive_available, false);
  const replay = await http.get(path + '/archive').expect(409);
  assert.equal(replay.body.error.code, 'INSTALL_TICKET_USED');
  context.mock.timers.tick(600_000);
  assert.equal((await http.get(path).expect(404)).body.error.code, 'INSTALL_TICKET_INVALID');
});

test('每账号最多保留 20 张未过期票据，签发时清理已过期记录', async (context) => {
  context.mock.timers.enable({ apis: ['Date'] });
  const fixture = await serveTestHub(context);
  const { intake } = await publishSkill(fixture, { distribution: organization });
  const { path, credential } = await issuePersonalInstallTicket(fixture, intake.version_id);
  const { installTickets } = fixture.hub;
  const issue = () => installTickets.issue(fixture.reader, credential, intake.version_id);
  context.mock.timers.tick(60_000);
  for (let i = 1; i < 20; i++) assert((await issue()).ticket);
  await assert.rejects(issue, { status: 429, code: 'INSTALL_TICKET_LIMIT', retryable: true });
  context.mock.timers.tick(540_000);
  assert((await issue()).ticket);
  const first = path.split('/').at(-1)!;
  assert.equal(await fixture.store.get('install_tickets', sha256(first)), undefined);
});
