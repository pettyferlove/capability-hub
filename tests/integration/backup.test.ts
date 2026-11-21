import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { readFile, unlink, utimes, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { sha256 } from '@capability-hub/domain/canonical';
import type {
  HubFeedbackAttachmentRecord,
  HubFeedbackEventRecord,
  HubFeedbackRecord,
} from '@capability-hub/domain/models';
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
  type TestHub,
} from '../support/application.js';
import { createSqliteStore } from '../support/store.js';
import { catalogPromptState } from '../support/migrations.js';
import { assertFrozenEvidence } from '../support/evidence.js';

const execute = promisify(execFile);

function runOperation(
  operation: 'backup' | 'restore-import' | 'restore-check' | 'maintenance',
  dataDir: string,
  ...args: string[]
) {
  return execute(
    process.execPath,
    ['--conditions=development', '--import', 'tsx', `scripts/operations/${operation}.ts`, ...args],
    {
      env: {
        CAPABILITY_HUB_DATA_DIR: dataDir,
        CAPABILITY_HUB_INSTANCE_SECRET: 'ab'.repeat(32),
        CAPABILITY_HUB_LOG_LEVEL: 'silent',
      },
    },
  );
}

async function addFeedbackAttachment(
  fixture: TestHub,
  number: number,
  closedAt: string | null = null,
) {
  const createdAt = '2024-01-01T00:00:00.000Z';
  const bytes = Buffer.from(`反馈附件 ${number}\n`);
  const feedback: HubFeedbackRecord = {
    id: randomUUID(),
    number,
    submitted_by: fixture.reader.id,
    channel: 'web',
    kind: 'bug',
    surface: 'web',
    area: null,
    title: '反馈标题',
    description: '反馈正文',
    steps: '',
    expected: '',
    blocking: false,
    status: closedAt ? 'resolved' : 'pending',
    decline_reason: null,
    duplicate_of_id: null,
    assignee_id: null,
    diagnostics: null,
    submission: {},
    description_redacted_at: null,
    created_at: createdAt,
    updated_at: closedAt ?? createdAt,
    closed_at: closedAt,
    last_activity_at: closedAt ?? createdAt,
    last_submitter_activity_at: createdAt,
    last_handler_public_at: closedAt,
    submitter_seen_at: createdAt,
    revision: 2,
  };
  const hash = await fixture.blobs.put(bytes);
  const eventId = randomUUID();
  const attachment: HubFeedbackAttachmentRecord = {
    id: randomUUID(),
    feedback_id: feedback.id,
    event_id: eventId,
    uploaded_by: fixture.reader.id,
    kind: 'text',
    media_type: 'text/plain',
    name: '详情.txt',
    size: bytes.length,
    width: null,
    height: null,
    sha256: hash,
    created_at: createdAt,
    removed_at: null,
    removed_by: null,
    removal_reason: null,
  };
  const event: HubFeedbackEventRecord = {
    id: eventId,
    feedback_id: feedback.id,
    sequence: 1,
    actor_id: fixture.reader.id,
    actor_role: 'submitter',
    kind: 'comment',
    visibility: 'public',
    body: '补充详情',
    status_from: null,
    status_to: null,
    decline_reason: null,
    attachment_ids: [attachment.id],
    redacted_at: null,
    created_at: createdAt,
  };
  await fixture.store.tx(async () => {
    await fixture.store.insert('hub_feedback', feedback);
    await fixture.store.insert('hub_feedback_events', event);
    await fixture.store.insert('hub_feedback_attachments', attachment);
  });
  return { feedback, event, attachment, bytes, hash };
}

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

test('提示单例随快照恢复', async (context) => {
  const { store: source } = await createSqliteStore(context);
  const state = await source.insert('catalog_prompts', catalogPromptState(1_000));
  const snapshot = parseSnapshot(JSON.parse(JSON.stringify(await snapshotStore(source))));
  const { store: restored } = await createSqliteStore(context);
  await restoreStore(restored, snapshot);
  assert.deepEqual(await restored.get('catalog_prompts', state.id), state);
});

test('仅旧版清单可导入没有提示表的完整发布快照，归档对象仍可复查', async (context) => {
  const fixture = await createTestHub(context);
  const { intake } = await publishSkill(fixture);
  const path = join(fixture.directory, 'previous-backup');
  await runOperation('backup', fixture.directory, path);
  const recordsPath = join(path, 'records.json');
  const manifestPath = join(path, 'backup.json');
  const tables = JSON.parse(await readFile(recordsPath, 'utf8')) as Record<string, unknown>;
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as Record<string, unknown>;
  delete tables.catalog_prompts;
  const records = JSON.stringify(tables);
  await writeFile(recordsPath, records);
  const checked = { ...manifest, records_sha256: sha256(records) };
  const { store, directory } = await createSqliteStore(context);
  await writeFile(manifestPath, JSON.stringify(checked));
  await assert.rejects(runOperation('restore-import', directory, path), /备份记录格式无效/);
  await writeFile(manifestPath, JSON.stringify({ ...checked, schema: 1 }));
  await runOperation('restore-import', directory, path);
  assert.deepEqual(
    await store.get('versions', intake.version_id),
    await fixture.store.get('versions', intake.version_id),
  );
  assert.deepEqual(await store.all('catalog_prompts'), []);
  await runOperation('restore-check', directory);
});

test('反馈附件随备份复制和恢复，恢复检查拒绝损坏或缺失的对象', async (context) => {
  const fixture = await createTestHub(context);
  const { feedback, event, attachment, bytes, hash } = await addFeedbackAttachment(fixture, 1);
  const backupPath = join(fixture.directory, 'backup');
  const { directory, store } = await createSqliteStore(context);

  await runOperation('backup', fixture.directory, backupPath);
  assert.deepEqual(await readFile(join(backupPath, 'blobs', hash)), bytes);
  await runOperation('restore-import', directory, backupPath);
  assert.deepEqual(await store.get('hub_feedback', feedback.id), feedback);
  assert.deepEqual(await store.get('hub_feedback_events', event.id), event);
  assert.deepEqual(await store.get('hub_feedback_attachments', attachment.id), attachment);
  const restoredBlob = join(directory, 'blobs', hash);
  assert.deepEqual(await readFile(restoredBlob), bytes);
  await runOperation('restore-check', directory);

  const error = {
    code: 1,
    stderr: `hub_feedback ${feedback.id}: attachment ${attachment.id} missing or corrupt\n`,
  };
  await writeFile(restoredBlob, '损坏的内容');
  await assert.rejects(() => runOperation('restore-check', directory), error);
  await unlink(restoredBlob);
  await assert.rejects(() => runOperation('restore-check', directory), error);
});

test('维护先解除过期反馈附件引用，再回收无引用的旧对象', async (context) => {
  const fixture = await createTestHub(context);
  const old = '2024-01-02T00:00:00.000Z';
  const recent = new Date().toISOString();
  const expired = await addFeedbackAttachment(fixture, 1, old);
  const open = await addFeedbackAttachment(fixture, 2);
  const closedRecently = await addFeedbackAttachment(fixture, 3, recent);
  const freshBlob = await addFeedbackAttachment(fixture, 4, old);
  for (const { hash } of [expired, open, closedRecently])
    await utimes(join(fixture.directory, 'blobs', hash), new Date(old), new Date(old));

  await runOperation('maintenance', fixture.directory, '--collect-blobs');
  for (const { attachment, feedback } of [expired, freshBlob]) {
    const updatedAttachment = await fixture.store.get('hub_feedback_attachments', attachment.id);
    assert(updatedAttachment?.removed_at);
    assert.deepEqual(updatedAttachment, {
      ...attachment,
      sha256: null,
      removed_at: updatedAttachment.removed_at,
      removed_by: null,
      removal_reason: 'retention',
    });
    assert.deepEqual(await fixture.store.get('hub_feedback', feedback.id), {
      ...feedback,
      revision: feedback.revision + 1,
      updated_at: updatedAttachment.removed_at,
    });
    const audited = (await fixture.store.all('audit')).filter(
      (row) => row.action === 'hub_feedback.attachment_removed' && row.entity_id === feedback.id,
    );
    assert.equal(audited.length, 1);
    assert.equal(audited[0].actor_id, 'system');
    assert.deepEqual(audited[0].metadata, { attachment_id: attachment.id, reason: 'retention' });
  }
  assert.equal(await fixture.blobs.exists(expired.hash), false);
  for (const { attachment, hash } of [open, closedRecently]) {
    assert.deepEqual(
      await fixture.store.get('hub_feedback_attachments', attachment.id),
      attachment,
    );
    assert.equal(await fixture.blobs.exists(hash), true);
  }
  assert.equal(await fixture.blobs.exists(freshBlob.hash), true);
  await runOperation('restore-check', fixture.directory);
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
