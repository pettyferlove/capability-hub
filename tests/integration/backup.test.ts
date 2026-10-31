import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import {
  snapshotStore,
  parseSnapshot,
  restoreStore,
  blobReferences,
} from '@capability-hub/infrastructure/store';
import {
  createTestHub,
  publishSkill,
  receiveSkill,
  submitPublication,
} from '../support/application.js';
import { createSqliteStore } from '../support/store.js';
import { assertFrozenEvidence } from '../support/evidence.js';

test('扫描与冻结申请不能被删除或替换，审核完成后的决定也不能重写', async (context) => {
  const fixture = await createTestHub(context);
  const intake = await receiveSkill(fixture);
  const request = await submitPublication(fixture, intake);
  await assertFrozenEvidence(fixture.store, intake.scan_run_id, request.id);
  await fixture.hub.publications.decide(
    fixture.reviewer,
    request.id,
    {
      decision: 'approve',
      comment: '已核对证据',
      policy_digest: request.policy_digest,
      accepted_warnings: [],
    },
    '"1"',
    randomUUID(),
  );
  const decided = await fixture.store.get('requests', request.id);
  assert(decided);
  await assert.rejects(
    () => fixture.store.put('requests', { ...decided, decision_reason: '改写已有决定' }),
    /immutable/,
  );
  assert.deepEqual(await fixture.store.get('requests', request.id), decided);
});

test('备份完整发布图后可恢复到空数据库，审计与固定内容引用保持原样', async (context) => {
  const fixture = await createTestHub(context);
  const { intake } = await publishSkill(fixture);
  await fixture.hub.feedback.report(fixture.reader, {
    version_id: intake.version_id,
    idempotency_key: randomUUID(),
    consent: true,
    kind: 'suggestion',
    title: '补充示例',
    scenario: '首次使用',
    expected: '提供完整示例',
    actual: '仅有简要说明',
    location: '',
    reproduction: '',
    evidence: '',
    suggestion: '',
    blocking: false,
  });
  const snapshot = parseSnapshot(JSON.parse(JSON.stringify(await snapshotStore(fixture.store))));
  const { store: restored } = await createSqliteStore(context);
  await restoreStore(restored, snapshot);
  assert.deepEqual(await snapshotStore(restored), snapshot);
  const references = blobReferences(snapshot);
  assert(references.length >= 2);
  for (const reference of references) assert(await fixture.blobs.exists(reference));
  await assert.rejects(() => restoreStore(restored, snapshot), /必须为空/);
  assert.deepEqual(await snapshotStore(restored), snapshot);
});

test('快照拒绝缺失字段、无效内容引用、重复记录和未知表，损坏关联恢复全部回滚', async (context) => {
  const fixture = await createTestHub(context);
  await publishSkill(fixture);
  const snapshot = await snapshotStore(fixture.store);
  assert.throws(() => parseSnapshot({ ...snapshot, versions: [{ id: randomUUID() }] }));
  assert.throws(() => parseSnapshot({ ...snapshot, unknown: [] }));
  assert.throws(() =>
    parseSnapshot({ ...snapshot, users: [...snapshot.users, snapshot.users[0]] }),
  );
  assert.throws(() =>
    parseSnapshot({
      ...snapshot,
      versions: snapshot.versions.map((version) => ({
        ...version,
        files: [{ ...version.files[0], blob_ref: '../outside' }],
      })),
    }),
  );
  const { store } = await createSqliteStore(context);
  const broken = {
    ...snapshot,
    releases: snapshot.releases.map((release) => ({ ...release, version_id: randomUUID() })),
  };
  await assert.rejects(() => restoreStore(store, broken));
  assert.equal((await store.all('users')).length, 0);
  assert.equal((await store.all('releases')).length, 0);
});

test('不可变内容按 JSON 结构比较，属性重排可以更新可变状态，内容修改仍被数据库拒绝', async (context) => {
  const fixture = await createTestHub(context);
  const { intake } = await publishSkill(fixture);
  const version = await fixture.store.get('versions', intake.version_id);
  assert(version);
  const reordered = Object.fromEntries(Object.entries(version).reverse()) as typeof version;
  await fixture.store.put('versions', { ...reordered, availability: 'revoked' });
  assert.equal((await fixture.store.get('versions', version.id))?.availability, 'revoked');
  await assert.rejects(
    () =>
      fixture.store.put('versions', {
        ...version,
        metadata: { ...version.metadata, description: '偷偷替换内容' },
      }),
    /immutable/,
  );
  assert.equal(
    (await fixture.store.get('versions', version.id))?.metadata.description,
    version.metadata.description,
  );
});
