import assert from 'node:assert/strict';
import { digest, sha256 } from '@capability-hub/domain/canonical';
import { publishSkill, type TestHub } from './application.js';

/** 以无团队成员身份签发票据，覆盖组织受众而非维护权限。 */
export async function issuePersonalInstallTicket(fixture: TestHub, versionId: string) {
  const token = await fixture.hub.tokens.issue(fixture.reader, { name: 'install-ticket' });
  const credential = { kind: 'personal' as const, id: sha256(token.token) };
  const { ticket } = await fixture.hub.installTickets.issue(fixture.reader, credential, versionId);
  assert(ticket);
  return { path: `/api/install-tickets/${ticket}`, credential };
}

/** 同一票据并发兑换只能交付一次字节，且不会消耗清单读取能力。 */
export async function assertSingleInstallRedemption(fixture: TestHub & { origin: string }) {
  const { intake } = await publishSkill(fixture, {
    distribution: { mode: 'approved_audience', audience: ['organization'] },
  });
  const { path } = await issuePersonalInstallTicket(fixture, intake.version_id);
  const url = fixture.origin + path;
  const initial = await fetch(url);
  assert.equal(initial.status, 200);
  const meta = await initial.json();
  assert.equal(meta.archive_available, true);
  assert.equal(meta.version_id, intake.version_id);

  const responses = await Promise.all([fetch(url + '/archive'), fetch(url + '/archive')]);
  const [download, replay] = responses.sort((a, b) => a.status - b.status);
  assert.equal(download.status, 200);
  assert.equal(download.headers.get('Content-Type'), 'application/zip');
  assert.equal(download.headers.get('X-Content-SHA256'), meta.artifact_digest);
  assert.equal(digest(Buffer.from(await download.arrayBuffer())), meta.artifact_digest);
  assert.equal(replay.status, 409);
  assert.equal((await replay.json()).error.code, 'INSTALL_TICKET_USED');

  const described = await fetch(url);
  assert.equal(described.status, 200);
  const after = await described.json();
  assert.deepEqual(
    { ...after, expires_at: meta.expires_at },
    { ...meta, archive_available: false },
  );
  const audits = await fixture.store.where('audit', 'entity_id', intake.version_id);
  assert.deepEqual(
    audits.filter((event) => event.action === 'content.download').map((event) => event.actor_id),
    [fixture.reader.id],
  );
}
