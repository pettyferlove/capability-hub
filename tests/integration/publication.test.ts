import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import type { PublicationDecisionCommand } from '@capability-hub/application';
import { publicationDecisionRequestSchema } from '@capability-hub/contracts';
import type { ScenarioDefinition } from '@capability-hub/contracts';
import { HubError } from '@capability-hub/domain/errors';
import type {
  ManagementAssetListResponse,
  ManagementAssetResponse,
} from '@capability-hub/contracts/http';
import { archive } from '@capability-hub/infrastructure/content';
import {
  createTestHub,
  publishSkill,
  receiveSkill,
  submitPublication,
  testPassword,
} from '../support/application.js';
import { signIn } from '../support/http.js';
import { skillDocument } from '../support/content.js';

const errorCode = (code: string) => (error: unknown) =>
  error instanceof HubError && error.code === code;

test('维护列表按名称稳定分页，删除末页资源后回到有效页，表单选项不被分页截断', async (context) => {
  const f = await createTestHub(context);
  const receipts = [];
  for (let index = 6; index >= 1; index--)
    receipts.push(
      await f.hub.intakes.receive(
        f.admin,
        Buffer.from('invalid ZIP'),
        'skill.zip',
        {
          target: 'new',
          kind: 'skill',
          slug: `page-${index}`,
          owner_group_id: f.teamId,
          version_label: '1.0.0',
        },
        randomUUID(),
      ),
    );
  const client = await signIn(f);
  const first = (
    await client.get('/api/management/assets?sort=name&page=1&page_size=5').expect(200)
  ).body as ManagementAssetListResponse;
  assert.equal(first.total, 6);
  assert.equal(first.page, 1);
  assert.equal(first.page_size, 5);
  assert.deepEqual(
    first.items.map((asset) => asset.slug),
    ['page-1', 'page-2', 'page-3', 'page-4', 'page-5'],
  );
  const last = (await client.get('/api/management/assets?sort=name&page=2&page_size=5').expect(200))
    .body as ManagementAssetListResponse;
  assert.deepEqual(
    last.items.map((asset) => asset.slug),
    ['page-6'],
  );
  const options = (await client.get('/api/management/assets/options').expect(200))
    .body as ManagementAssetResponse[];
  assert.equal(options.length, 6);
  assert(options.some((asset) => asset.id === last.items[0].id));
  await f.worker.tick();
  await f.worker.tick();
  await f.hub.lifecycle.deleteAsset(
    f.admin,
    receipts[0].asset_id,
    { reason: '清理错误资源' },
    '"1"',
    randomUUID(),
  );
  const remaining = (
    await client.get('/api/management/assets?sort=name&page=2&page_size=5').expect(200)
  ).body as ManagementAssetListResponse;
  assert.equal(remaining.page, 1);
  assert.equal(remaining.total, 5);
  assert.deepEqual(
    remaining.items.map((asset) => asset.id),
    first.items.map((asset) => asset.id),
  );
});

test('维护列表按业务变动全局分页，同时间按名称稳定排序，读取不刷新动态', async (context) => {
  context.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-11-01T00:00:00Z') });
  const f = await createTestHub(context);
  const intakes = [];
  for (let index = 1; index <= 6; index++) {
    context.mock.timers.tick(1000);
    intakes.push(await receiveSkill(f, { slug: `recent-${index}` }));
  }
  const client = await signIn(f);
  const first = (await client.get('/api/management/assets?page_size=5').expect(200))
    .body as ManagementAssetListResponse;
  assert.deepEqual(
    first.items.map((asset) => asset.slug),
    ['recent-6', 'recent-5', 'recent-4', 'recent-3', 'recent-2'],
  );
  const last = (await client.get('/api/management/assets?page_size=5&page=2').expect(200))
    .body as ManagementAssetListResponse;
  assert.equal(last.items[0].slug, 'recent-1');
  context.mock.timers.tick(1000);
  const request = await submitPublication(f, intakes[0]);
  context.mock.timers.tick(1000);
  await f.hub.publications.decide(
    f.reviewer,
    request.id,
    {
      decision: 'reject',
      comment: '请完善使用说明',
      policy_digest: request.policy_digest,
      accepted_warnings: [],
    },
    '"1"',
    randomUUID(),
  );
  const rejected = (await f.hub.assetManagement.list(f.admin)).items[0];
  assert.equal(rejected.id, intakes[0].asset_id);
  assert.deepEqual(rejected.latest_activity, {
    occurred_at: new Date().toISOString(),
    label: '审核退回',
  });
  context.mock.timers.tick(1000);
  await f.hub.assetManagement.versions(f.admin, rejected.id);
  assert.deepEqual(
    (await f.hub.assetManagement.list(f.admin)).items[0].latest_activity,
    rejected.latest_activity,
  );
  context.mock.timers.tick(1000);
  for (const intake of [intakes[5], intakes[0]])
    await f.hub.lifecycle.updateState(
      f.admin,
      intake.asset_id,
      {
        lifecycle: 'blocked',
        reason: '调查资源问题',
      },
      '"1"',
    );
  const blocked = await f.hub.assetManagement.list(f.admin);
  assert.deepEqual(
    blocked.items.slice(0, 2).map((asset) => asset.slug),
    ['recent-1', 'recent-6'],
  );
  assert.equal(blocked.items[0].latest_activity.label, '封禁资产');
});

test('需要处理只包含当前有权推进的版本，后续发布消除历史失败', async (context) => {
  context.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-11-01T00:00:00Z') });
  const f = await createTestHub(context);
  for (const state of ['ready', 'pending', 'rejected', 'stale', 'cancelled', 'approved']) {
    context.mock.timers.tick(1000);
    const intake = await receiveSkill(f, { slug: `attention-${state}` });
    if (state === 'ready') continue;
    context.mock.timers.tick(1000);
    const request = await submitPublication(f, intake);
    context.mock.timers.tick(1000);
    if (state === 'rejected' || state === 'approved')
      await f.hub.publications.decide(
        f.reviewer,
        request.id,
        {
          decision: state === 'approved' ? 'approve' : 'reject',
          comment: '核对使用说明',
          policy_digest: request.policy_digest,
          accepted_warnings: [],
        },
        '"1"',
        randomUUID(),
      );
    if (state === 'cancelled')
      await f.hub.publications.cancel(f.admin, request.id, { reason: '主动终止发布' }, '"1"');
    if (state === 'stale') {
      await f.store.tx(() =>
        f.hub.publications.invalidatePending(intake.asset_id, 'SOURCE_CONFIG_CHANGED'),
      );
      const asset = (await f.hub.assetManagement.list(f.admin)).items.find(
        (item) => item.id === intake.asset_id,
      )!;
      assert.deepEqual(asset.latest_activity, {
        occurred_at: new Date().toISOString(),
        label: '发布申请失效',
      });
    }
  }
  context.mock.timers.tick(1000);
  const failed = await f.hub.intakes.receive(
    f.admin,
    Buffer.from('invalid ZIP'),
    'skill.zip',
    {
      target: 'new',
      kind: 'skill',
      slug: 'attention-failed',
      owner_group_id: f.teamId,
      version_label: '1.0.0',
    },
    randomUUID(),
  );
  assert.equal((await f.hub.assetManagement.list(f.admin, { state: 'processing' })).total, 1);
  context.mock.timers.tick(1000);
  await f.worker.tick();
  const pending = await f.hub.assetManagement.list(f.admin, {
    state: 'needs_attention',
    sort: 'name',
  });
  assert.deepEqual(
    pending.items.map((asset) => asset.slug),
    ['attention-failed', 'attention-ready', 'attention-rejected', 'attention-stale'],
  );
  assert.equal(pending.items[0].latest_activity.label, '处理失败');
  context.mock.timers.tick(1000);
  await publishSkill(f, { slug: 'attention-failed', assetId: failed.asset_id, version: '1.0.1' });
  assert(
    !(await f.hub.assetManagement.list(f.admin, { state: 'needs_attention' })).items.some(
      (asset) => asset.id === failed.asset_id,
    ),
  );
  const ready = await f.store.find('assets', 'slug', 'attention-ready');
  assert(ready);
  await f.hub.lifecycle.updateState(
    f.admin,
    ready.id,
    { lifecycle: 'deprecated', reason: '不再维护' },
    '"1"',
  );
  assert(
    !(await f.hub.assetManagement.list(f.admin, { state: 'needs_attention' })).items.some(
      (asset) => asset.id === ready.id,
    ),
  );
  const role = await f.hub.administration.createRole(f.admin, {
    name: '只维护不共享',
    permissions: ['asset:maintain'],
  });
  await f.hub.administration.grantRole(f.admin, {
    principal_id: f.reader.id,
    role_id: role.id,
    scope_type: 'platform',
    scope_id: '',
  });
  const reader = await f.hub.identity.principal(f.reader.id);
  assert.equal((await f.hub.assetManagement.list(reader, { state: 'needs_attention' })).total, 0);
});

test('较早版本获批后，较新申请即使仍为待审也会因基线失效进入需要处理', async (context) => {
  context.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-11-01T00:00:00Z') });
  const f = await createTestHub(context);
  const first = await receiveSkill(f);
  const earlier = await submitPublication(f, first);
  context.mock.timers.tick(1000);
  const latest = await receiveSkill(f, { assetId: first.asset_id, version: '1.0.1' });
  await submitPublication(f, latest);
  context.mock.timers.tick(1000);
  await f.hub.publications.decide(
    f.reviewer,
    earlier.id,
    {
      decision: 'approve',
      comment: '先发布已核对的版本',
      policy_digest: earlier.policy_digest,
      accepted_warnings: [],
    },
    '"1"',
    randomUUID(),
  );
  const pending = await f.hub.assetManagement.list(f.admin, { state: 'needs_attention' });
  assert.equal(pending.total, 1);
  assert.equal(pending.items[0].latest_intake?.id, latest.id);
  assert.equal(pending.items[0].latest_intake?.state, 'pending');
  assert.equal(pending.items[0].pending_requests[0].context_valid, false);
});

test('维护列表的搜索、状态和总数只包含有权资源，生命周期权限不泄露待审候选', async (context) => {
  const f = await createTestHub(context);
  const pending = await receiveSkill(f, { slug: 'pending-skill' });
  await submitPublication(f, pending);
  const blocked = await receiveSkill(f, { slug: 'blocked-skill' });
  await f.hub.lifecycle.updateState(
    f.admin,
    blocked.asset_id,
    { lifecycle: 'blocked', reason: '待调查' },
    '"1"',
  );
  const role = await f.hub.administration.createRole(f.admin, {
    name: '生命周期维护',
    permissions: ['asset:lifecycle'],
  });
  await f.hub.administration.grantRole(f.admin, {
    principal_id: f.reader.id,
    role_id: role.id,
    scope_type: 'asset',
    scope_id: pending.asset_id,
  });
  const admin = await signIn(f);
  const reader = await signIn(f, 'reader');
  const matched = (
    await admin
      .get('/api/management/assets')
      .query({ q: 'SKILL pending', state: 'pending' })
      .expect(200)
  ).body as ManagementAssetListResponse;
  assert.equal(matched.total, 1);
  assert.equal(matched.items[0].id, pending.asset_id);
  const unavailable = (await admin.get('/api/management/assets?state=blocked').expect(200))
    .body as ManagementAssetListResponse;
  assert.deepEqual(
    unavailable.items.map((asset) => asset.id),
    [blocked.asset_id],
  );
  const permitted = (await reader.get('/api/management/assets').expect(200))
    .body as ManagementAssetListResponse;
  assert.equal(permitted.total, 1);
  assert.equal(permitted.items[0].latest_intake, null);
  assert.equal(permitted.items[0].latest_activity.label, '新建资产');
  assert.equal(permitted.items[0].needs_attention, false);
  assert.deepEqual(permitted.items[0].pending_requests, []);
  for (const query of [
    { state: 'pending' },
    { state: 'needs_attention' },
    { state: 'processing' },
    { q: 'blocked' },
    { state: 'blocked' },
  ]) {
    const hidden = (await reader.get('/api/management/assets').query(query).expect(200))
      .body as ManagementAssetListResponse;
    assert.equal(hidden.total, 0);
    assert.equal(hidden.page, 1);
    assert.deepEqual(hidden.items, []);
  }
  const options = (await reader.get('/api/management/assets/options').expect(200))
    .body as ManagementAssetResponse[];
  assert.deepEqual(
    options.map((asset) => asset.id),
    [pending.asset_id],
  );
});

test('维护分页拒绝无效页码、页大小、状态和未知查询参数', async (context) => {
  const f = await createTestHub(context);
  const client = await signIn(f);
  for (const query of [
    'page=0',
    'page=1.5',
    'page_size=100',
    'state=failed',
    'sort=created_at',
    'sort=name&sort=recent_activity',
    'unknown=1',
    'page=1&page=2',
  ])
    await client.get('/api/management/assets?' + query).expect(422);
});

test('管理列表显示最近上传人，各版本保留原上传人且重扫不改变归属', async (context) => {
  const f = await createTestHub(context);
  const first = await receiveSkill(f);
  const maintainer = await f.store.find('roles', 'key', 'maintainer');
  assert(maintainer);
  await f.hub.administration.grantRole(f.admin, {
    principal_id: f.reviewer.id,
    role_id: maintainer.id,
    scope_type: 'asset',
    scope_id: first.asset_id,
  });
  const uploader = await f.hub.identity.principal(f.reviewer.id);
  const next = await receiveSkill(
    { ...f, admin: uploader },
    { assetId: first.asset_id, version: '1.0.1' },
  );
  const rescan = await f.hub.intakes.rescan(f.admin, next.id, randomUUID());
  await f.worker.tick();
  assert.equal((await f.store.get('intakes', rescan.intake_id))?.state, 'ready');
  assert.equal((await f.hub.assetManagement.list(f.reader)).total, 0);
  await assert.rejects(
    () => f.hub.assetManagement.versions(f.reader, first.asset_id),
    errorCode('FORBIDDEN'),
  );
  const lifecycle = await f.hub.administration.createRole(f.admin, {
    name: '资源处置',
    permissions: ['asset:lifecycle'],
  });
  await f.hub.administration.grantRole(f.admin, {
    principal_id: f.reader.id,
    role_id: lifecycle.id,
    scope_type: 'asset',
    scope_id: first.asset_id,
  });
  const manager = await f.hub.identity.principal(f.reader.id);
  const contribution = {
    source_kind: 'upload',
    actor: { kind: 'user', name: uploader.display_name, username: uploader.username },
  };
  for (const principal of [f.admin, manager]) {
    const list = await f.hub.assetManagement.list(principal);
    assert.deepEqual(list.items[0].latest_contributor, contribution);
    const versions = await f.hub.assetManagement.versions(principal, first.asset_id);
    assert.deepEqual(
      versions.find((v) => v.version_id === next.version_id)?.contributor,
      contribution,
    );
    assert.deepEqual(versions.find((v) => v.version_id === first.version_id)?.contributor, {
      source_kind: 'upload',
      actor: { kind: 'user', name: f.admin.display_name, username: f.admin.username },
    });
  }
  const managed = (await f.hub.assetManagement.list(manager)).items[0];
  assert.equal(managed.latest_intake, null);
  assert.deepEqual(managed.pending_requests, []);
});

for (const target of ['assets', 'intakes'] as const)
  test(`删除错误资源与 ${target} 列表读取并发时，列表仍返回完整快照`, async (context) => {
    const f = await createTestHub(context);
    const receipt = await f.hub.intakes.receive(
      f.admin,
      Buffer.from('invalid ZIP'),
      'skill.zip',
      {
        target: 'new',
        kind: 'skill',
        slug: 'broken',
        owner_group_id: f.teamId,
        version_label: '1.0.0',
      },
      randomUUID(),
    );
    await f.worker.tick();
    const list = async () =>
      target === 'assets'
        ? (await f.hub.assetManagement.list(f.admin)).items
        : (await f.hub.intakeQueries.list(f.admin, {})).items;
    const [before] = await Promise.all([
      list(),
      f.hub.lifecycle.deleteAsset(
        f.admin,
        receipt.asset_id,
        { reason: '清理错误资源' },
        '"1"',
        randomUUID(),
      ),
    ]);
    assert.equal(before.length, 1);
    assert.deepEqual(await list(), []);
  });

for (const target of ['列表', '详情', '研判权限'] as const)
  test(`版本删除与审核${target}读取并发时保留完整快照，删除后不再返回申请`, async (context) => {
    const f = await createTestHub(context);
    const intake = await receiveSkill(f);
    const request = await submitPublication(f, intake);
    await f.hub.publications.cancel(f.admin, request.id, { reason: '放弃发布' }, '"1"');
    const read = async () => {
      if (target === '列表')
        return (await f.hub.publicationQueries.listRequests(f.reviewer, 'cancelled'))[0];
      if (target === '详情') return f.hub.publicationQueries.getReview(f.reviewer, request.id);
      return f.hub.publicationQueries.requireAgentAccess(f.reviewer, request.id, 'inspect');
    };
    const [before] = await Promise.all([
      read(),
      f.hub.lifecycle.deleteVersion(
        f.admin,
        intake.version_id,
        { reason: '清理未发布版本' },
        '"1"',
        randomUUID(),
      ),
    ]);
    assert.equal(before.id, request.id);
    if (target === '列表') assert.equal(await read(), undefined);
    else await assert.rejects(read, errorCode('NOT_FOUND'));
  });

test('首次上传名称错误的资源可删除并释放名称，保留审计且不影响相同内容的正确资源', async (context) => {
  const f = await createTestHub(context);
  const bytes = await archive([{ path: 'SKILL.md', bytes: skillDocument(), executable: false }]);
  const receipt = await f.hub.intakes.receive(
    f.admin,
    bytes,
    'skill.zip',
    {
      target: 'new',
      kind: 'skill',
      slug: 'wrong-name',
      owner_group_id: f.teamId,
      version_label: '1.0.0',
    },
    randomUUID(),
  );
  await f.worker.tick();
  const intake = await f.store.get('intakes', receipt.intake_id);
  assert.equal(intake?.state, 'failed');
  assert(!intake.version_id);
  const correct = await receiveSkill(f);
  const client = await signIn(f);
  const items = (await client.get('/api/management/assets').expect(200)).body.items as {
    id: string;
    can_delete: boolean;
  }[];
  assert.equal(items.find((item) => item.id === receipt.asset_id)?.can_delete, true);
  assert.equal(items.find((item) => item.id === correct.asset_id)?.can_delete, true);
  const key = randomUUID();
  const remove = () =>
    client
      .delete('/api/assets/' + receipt.asset_id)
      .set('If-Match', '"1"')
      .set('Idempotency-Key', key)
      .send({ reason: '首次上传时资源名称填写错误' });
  await remove().expect(200, { ok: true });
  await remove().expect(200, { ok: true });
  assert.equal(await f.store.get('assets', receipt.asset_id), undefined);
  assert.equal(await f.store.get('intakes', receipt.intake_id), undefined);
  assert.equal(await f.store.get('sources', intake.source_id), undefined);
  assert.deepEqual(await f.store.where('jobs', 'aggregate_id', intake.id), []);
  const audit = await f.store.where('audit', 'action', 'asset.deleted');
  assert.equal(audit.length, 1);
  assert.equal(audit[0].subject?.name, 'wrong-name');
  assert.equal(audit[0].reason, '首次上传时资源名称填写错误');
  assert(await f.store.find('audit', 'entity_id', intake.id));
  assert(await f.store.get('versions', correct.version_id));
  assert.deepEqual(await f.blobs.read(intake.payload_ref!), bytes);
  assert.equal((await client.get('/api/management/assets').expect(200)).body.items.length, 1);
  const replacement = await receiveSkill(f, { slug: 'wrong-name' });
  assert.notEqual(replacement.asset_id, receipt.asset_id);
});

test('删除错误资源必须通过当前维护权限、修订号、幂等键和原因校验', async (context) => {
  const f = await createTestHub(context);
  const receipt = await f.hub.intakes.receive(
    f.admin,
    Buffer.from('invalid ZIP'),
    'skill.zip',
    {
      target: 'new',
      kind: 'skill',
      slug: 'broken',
      owner_group_id: f.teamId,
      version_label: '1.0.0',
    },
    randomUUID(),
  );
  await f.worker.tick();
  const client = await signIn(f);
  const outsider = await signIn(f, 'reader');
  const path = '/api/assets/' + receipt.asset_id;
  for (const check of [
    {
      client: outsider,
      revision: '"1"',
      key: randomUUID(),
      reason: '误上传',
      code: 'FORBIDDEN',
      status: 403,
    },
    {
      client,
      revision: '',
      key: randomUUID(),
      reason: '误上传',
      code: 'IF_MATCH_REQUIRED',
      status: 428,
    },
    {
      client,
      revision: '"2"',
      key: randomUUID(),
      reason: '误上传',
      code: 'REVISION_CONFLICT',
      status: 412,
    },
    {
      client,
      revision: '"1"',
      key: '',
      reason: '误上传',
      code: 'IDEMPOTENCY_REQUIRED',
      status: 400,
    },
  ]) {
    const response = await check.client
      .delete(path)
      .set('If-Match', check.revision)
      .set('Idempotency-Key', check.key)
      .send({ reason: check.reason })
      .expect(check.status);
    assert.equal(response.body.error.code, check.code);
    assert(await f.store.get('assets', receipt.asset_id));
  }
  for (const body of [{ reason: '   ' }, { reason: '误上传', force: true }])
    await client
      .delete(path)
      .set('If-Match', '"1"')
      .set('Idempotency-Key', randomUUID())
      .send(body)
      .expect(422);
  const role = (await f.store.find('roles', 'key', 'maintainer'))!;
  await f.hub.administration.grantRole(f.admin, {
    principal_id: f.reader.id,
    role_id: role.id,
    scope_type: 'asset',
    scope_id: receipt.asset_id,
  });
  await outsider
    .delete(path)
    .set('If-Match', '"1"')
    .set('Idempotency-Key', randomUUID())
    .send({ reason: '清理错误资源' })
    .expect(200);
  assert.deepEqual(await f.store.where('role_bindings', 'scope_id', receipt.asset_id), []);
});

test('资源删除拦截排队和处理中作业，未发布内容就绪后允许清理', async (context) => {
  const f = await createTestHub(context);
  const receipt = await f.hub.intakes.receive(
    f.admin,
    Buffer.from('invalid ZIP'),
    'skill.zip',
    {
      target: 'new',
      kind: 'skill',
      slug: 'retry-skill',
      owner_group_id: f.teamId,
      version_label: '1.0.0',
    },
    randomUUID(),
  );
  const rejectDeletion = async () => {
    assert.equal((await f.hub.assetManagement.list(f.admin)).items[0].can_delete, false);
    await assert.rejects(
      () =>
        f.hub.lifecycle.deleteAsset(
          f.admin,
          receipt.asset_id,
          { reason: '清理错误资源' },
          '"1"',
          randomUUID(),
        ),
      errorCode('ASSET_DELETE_UNAVAILABLE'),
    );
  };
  await rejectDeletion();
  await f.worker.tick();
  assert.equal((await f.hub.assetManagement.list(f.admin)).items[0].can_delete, true);
  const queued = await f.hub.jobs.enqueue('intake', receipt.intake_id, {});
  await rejectDeletion();
  const claimed = await f.hub.jobs.claim('deletion-test');
  assert.equal(claimed?.id, queued.id);
  await rejectDeletion();
  await f.store.put('jobs', { ...claimed!, state: 'cancelled', lease_until: 0 });
  const next = await f.hub.intakes.receive(
    f.admin,
    await archive([{ path: 'SKILL.md', bytes: skillDocument('retry-skill'), executable: false }]),
    'skill.zip',
    { target: 'existing', asset_id: receipt.asset_id, version_label: '1.0.0' },
    randomUUID(),
  );
  await rejectDeletion();
  await f.worker.tick();
  const ready = await f.hub.intakeQueries.getDetail(f.admin, next.intake_id);
  assert.equal(ready.state, 'ready');
  assert.equal((await f.hub.assetManagement.list(f.admin)).items[0].can_delete, true);
  assert(await f.store.get('versions', ready.version_id));
  await f.hub.lifecycle.deleteAsset(
    f.admin,
    receipt.asset_id,
    { reason: '放弃发布' },
    '"1"',
    randomUUID(),
  );
  assert.equal(await f.store.get('versions', ready.version_id), undefined);
});

test('资源删除不能绕过封禁，删除 Git 同步绑定还需来源管理权限', async (context) => {
  const f = await createTestHub(context, {
    gitHosts: ['127.0.0.1'],
    privateGitHosts: ['127.0.0.1'],
  });
  const receipt = await f.hub.intakes.receive(
    f.admin,
    Buffer.from('invalid ZIP'),
    'skill.zip',
    {
      target: 'new',
      kind: 'skill',
      slug: 'blocked-skill',
      owner_group_id: f.teamId,
      version_label: '1.0.0',
    },
    randomUUID(),
  );
  await f.worker.tick();
  const blocked = await f.hub.lifecycle.updateState(
    f.admin,
    receipt.asset_id,
    { lifecycle: 'blocked', reason: '待调查' },
    '"1"',
  );
  assert.equal((await f.hub.assetManagement.list(f.admin)).items[0].can_delete, false);
  await assert.rejects(
    () =>
      f.hub.lifecycle.deleteAsset(
        f.admin,
        receipt.asset_id,
        { reason: '清理错误资源' },
        `"${blocked.revision}"`,
        randomUUID(),
      ),
    errorCode('ASSET_DELETE_UNAVAILABLE'),
  );
  const active = await f.hub.lifecycle.updateState(
    f.admin,
    receipt.asset_id,
    { lifecycle: 'active', reason: '调查结束' },
    `"${blocked.revision}"`,
  );
  const source = await f.hub.sources.create(
    f.admin,
    {
      repository_url: 'https://127.0.0.1/team/skills.git',
      provider: 'generic-git',
      branch: 'main',
      owner_group_id: f.teamId,
      targets: [
        {
          slug: 'git-skill',
          kind: 'skill',
          path: 'skills/git-skill',
          category: 'uncategorized',
          scenario_ids: [],
          distribution: { mode: 'approved_audience', audience: ['group:' + f.teamId] },
          applies_to: {},
        },
      ],
    },
    randomUUID(),
  );
  await f.hub.lifecycle.migrateSource(
    f.admin,
    receipt.asset_id,
    {
      destination_source_id: source.id,
      destination_source_revision: source.revision,
      path: 'skills/blocked-skill',
      reason: '交由 Git 维护',
    },
    `"${active.revision}"`,
  );
  const migrated = await f.hub.assetAccess.getAsset(receipt.asset_id);
  const role = (await f.store.find('roles', 'key', 'maintainer'))!;
  await f.hub.administration.grantRole(f.admin, {
    principal_id: f.reader.id,
    role_id: role.id,
    scope_type: 'asset',
    scope_id: receipt.asset_id,
  });
  const maintainer = await f.hub.identity.principal(f.reader.id);
  assert.match(
    (await f.hub.assetManagement.list(maintainer)).items[0].delete_block_reason!,
    /来源管理权限/,
  );
  assert.equal(
    (await f.hub.assetManagement.list(f.admin)).items.find((item) => item.id === receipt.asset_id)
      ?.can_delete,
    true,
  );
  await assert.rejects(
    () =>
      f.hub.lifecycle.deleteAsset(
        maintainer,
        receipt.asset_id,
        { reason: '清理错误资源' },
        `"${migrated.revision}"`,
        randomUUID(),
      ),
    errorCode('ASSET_DELETE_UNAVAILABLE'),
  );
  await f.hub.lifecycle.deleteAsset(
    f.admin,
    receipt.asset_id,
    { reason: '清理未发布资源' },
    `"${migrated.revision}"`,
    randomUUID(),
  );
  assert.equal(await f.store.get('assets', receipt.asset_id), undefined);
  assert.deepEqual(await f.store.where('bindings', 'asset_id', receipt.asset_id), []);
  assert.equal(await f.store.get('sources', blocked.source_id), undefined);
  const remaining = await f.hub.sources.get(f.admin, source.id);
  assert.equal(remaining.targets.length, 1);
  const last = await f.hub.assetAccess.getAsset(remaining.targets[0].asset_id);
  await f.hub.lifecycle.deleteAsset(
    f.admin,
    last.id,
    { reason: '移除最后一个未发布目标' },
    `"${last.revision}"`,
    randomUUID(),
  );
  assert.equal((await f.hub.sources.get(f.admin, source.id)).state, 'paused');
  assert.deepEqual((await f.hub.sources.get(f.admin, source.id)).targets, []);
});

test('删除已迁移的未发布资源不改变旧 Git 来源的封禁状态', async (context) => {
  const f = await createTestHub(context, {
    gitHosts: ['127.0.0.1'],
    privateGitHosts: ['127.0.0.1'],
  });
  const sources = [];
  for (const slug of ['old-source', 'destination'])
    sources.push(
      await f.hub.sources.create(
        f.admin,
        {
          repository_url: `https://127.0.0.1/team/${slug}.git`,
          provider: 'generic-git',
          branch: 'main',
          owner_group_id: f.teamId,
          targets: [
            {
              slug,
              kind: 'skill',
              path: 'skills/' + slug,
              category: 'uncategorized',
              scenario_ids: [],
              distribution: { mode: 'approved_audience', audience: ['group:' + f.teamId] },
              applies_to: {},
            },
          ],
        },
        randomUUID(),
      ),
    );
  const asset = await f.hub.assetAccess.getAsset('old-source');
  await f.hub.lifecycle.migrateSource(
    f.admin,
    asset.id,
    {
      destination_source_id: sources[1].id,
      destination_source_revision: sources[1].revision,
      path: 'skills/old-source',
      reason: '迁移来源',
    },
    `"${asset.revision}"`,
  );
  const old = await f.hub.sources.get(f.admin, sources[0].id);
  await f.hub.sources.revokeDistribution(
    f.admin,
    old.id,
    { reason: '封禁旧来源' },
    `"${old.revision}"`,
  );
  const blocked = await f.store.get('sources', old.id);
  const migrated = await f.hub.assetAccess.getAsset(asset.id);
  await f.hub.lifecycle.deleteAsset(
    f.admin,
    asset.id,
    { reason: '放弃发布' },
    `"${migrated.revision}"`,
    randomUUID(),
  );
  assert.deepEqual(await f.store.get('sources', old.id), blocked);
});

test('从未发布的弃用资源可清理全部候选版本和已结束审核，保留审计与共享内容', async (context) => {
  const f = await createTestHub(context);
  const first = await receiveSkill(f);
  const intakes = [first];
  for (const [index, state] of ['cancelled', 'rejected', 'stale'].entries()) {
    const intake =
      index === 0
        ? first
        : await receiveSkill(f, { assetId: first.asset_id, version: `1.0.${index}` });
    if (index) intakes.push(intake);
    const request = await submitPublication(f, intake);
    if (state === 'cancelled')
      await f.hub.publications.cancel(f.admin, request.id, { reason: '重新整理' }, '"1"');
    if (state === 'rejected')
      await f.hub.publications.decide(
        f.reviewer,
        request.id,
        { ...approval(request), decision: 'reject' },
        '"1"',
        randomUUID(),
      );
  }
  const asset = await f.hub.lifecycle.updateState(
    f.admin,
    first.asset_id,
    { lifecycle: 'deprecated', reason: '放弃发布' },
    '"1"',
  );
  const requests = await f.store.where('requests', 'asset_id', asset.id);
  assert.deepEqual(
    new Set(requests.map((request) => request.state)),
    new Set(['cancelled', 'rejected', 'stale']),
  );
  const versions = await f.store.where('versions', 'asset_id', asset.id);
  const blob = await f.blobs.read(versions[0].artifact_ref);
  const audits = await f.store.all('audit');
  assert.equal((await f.hub.assetManagement.list(f.admin)).items[0].can_delete, true);
  const client = await signIn(f);
  await client
    .delete('/api/assets/' + asset.id)
    .set('If-Match', `"${asset.revision}"`)
    .set('Idempotency-Key', randomUUID())
    .send({ reason: '不再发布' })
    .expect(200);
  assert.equal(await f.store.get('assets', asset.id), undefined);
  assert.equal(await f.store.get('sources', asset.source_id), undefined);
  assert.deepEqual(await f.store.where('versions', 'asset_id', asset.id), []);
  assert.deepEqual(await f.store.where('requests', 'asset_id', asset.id), []);
  assert.deepEqual(await f.store.where('intakes', 'asset_id', asset.id), []);
  for (const intake of intakes) {
    assert.equal(await f.store.get('scans', intake.scan_run_id), undefined);
    assert.deepEqual(await f.store.where('jobs', 'aggregate_id', intake.id), []);
  }
  for (const audit of audits) assert.deepEqual(await f.store.get('audit', audit.id), audit);
  assert.deepEqual(await f.blobs.read(versions[0].artifact_ref), blob);
});

test('已发布资源可单独删除撤回的未发布版本，重复请求不删除资源或其他版本', async (context) => {
  const f = await createTestHub(context);
  const published = await publishSkill(f);
  const draft = await receiveSkill(f, { assetId: published.intake.asset_id, version: '1.0.1' });
  const request = await submitPublication(f, draft);
  await f.hub.publications.cancel(f.admin, request.id, { reason: '放弃更新' }, '"1"');
  const asset = await f.hub.assetAccess.getAsset(draft.asset_id);
  const versions = await f.hub.assetManagement.versions(f.admin, asset.id);
  assert.equal(
    versions.find((version) => version.version_id === draft.version_id)?.can_delete,
    true,
  );
  assert.equal(
    versions.find((version) => version.version_id === published.intake.version_id)?.can_delete,
    false,
  );
  assert.equal((await f.hub.assetManagement.list(f.admin)).items[0].can_delete, false);
  const client = await signIn(f);
  const key = randomUUID();
  const remove = () =>
    client
      .delete('/api/versions/' + draft.version_id)
      .set('If-Match', `"${asset.revision}"`)
      .set('Idempotency-Key', key)
      .send({ reason: '放弃更新' });
  await remove().expect(200, { ok: true });
  await remove().expect(200, { ok: true });
  assert.equal(await f.store.get('versions', draft.version_id), undefined);
  assert.equal(await f.store.get('intakes', draft.id), undefined);
  assert.equal(await f.store.get('scans', draft.scan_run_id), undefined);
  assert.equal(await f.store.get('requests', request.id), undefined);
  assert(await f.store.get('versions', published.intake.version_id));
  assert(await f.store.get('intakes', published.intake.id));
  const remaining = await f.hub.assetAccess.getAsset(asset.id);
  assert.equal(remaining.current_release_id, asset.current_release_id);
  assert.equal(remaining.revision, asset.revision + 1);
  const audit = await f.store.where('audit', 'action', 'version.deleted');
  assert.equal(audit.length, 1);
  assert.equal(audit[0].subject?.version_id, draft.version_id);
  assert.match(audit[0].subject?.detail ?? '', /1\.0\.1/);
});

test('待审与重扫中的版本禁止删除，结束后删除最后一个版本仍保留空资源', async (context) => {
  const f = await createTestHub(context);
  const intake = await receiveSkill(f);
  const request = await submitPublication(f, intake);
  const remove = () =>
    f.hub.lifecycle.deleteVersion(
      f.admin,
      intake.version_id,
      { reason: '清理草稿' },
      '"1"',
      randomUUID(),
    );
  await assert.rejects(remove, errorCode('VERSION_DELETE_UNAVAILABLE'));
  assert.match(
    (await f.hub.assetManagement.versions(f.admin, intake.asset_id))[0].delete_block_reason!,
    /撤回/,
  );
  await f.hub.publications.cancel(f.admin, request.id, { reason: '清理草稿' }, '"1"');
  const rescan = await f.hub.intakes.rescan(f.admin, intake.id, randomUUID());
  assert.equal((await f.store.get('intakes', rescan.intake_id))?.version_id, null);
  await assert.rejects(remove, errorCode('VERSION_DELETE_UNAVAILABLE'));
  await f.worker.tick();
  await remove();
  assert.equal(await f.store.get('intakes', rescan.intake_id), undefined);
  assert.deepEqual(await f.store.where('jobs', 'aggregate_id', rescan.intake_id), []);
  assert(await f.store.get('assets', intake.asset_id));
  assert.deepEqual(await f.hub.assetManagement.versions(f.admin, intake.asset_id), []);
  assert.equal((await f.hub.assetManagement.list(f.admin)).items[0].can_delete, true);
});

test('同版本重复上传仍在处理时禁止删除，完成后清理全部关联接收', async (context) => {
  const f = await createTestHub(context);
  const intake = await receiveSkill(f);
  const bytes = await archive([
    { path: 'SKILL.md', bytes: skillDocument('sample-skill'), executable: false },
  ]);
  const duplicate = await f.hub.intakes.receive(
    f.admin,
    bytes,
    'skill.zip',
    { target: 'existing', asset_id: intake.asset_id, version_label: '1.0.0' },
    randomUUID(),
  );
  const remove = () =>
    f.hub.lifecycle.deleteVersion(
      f.admin,
      intake.version_id,
      { reason: '清理重复上传' },
      '"1"',
      randomUUID(),
    );
  assert.equal((await f.store.get('intakes', duplicate.intake_id))?.version_id, undefined);
  await assert.rejects(remove, errorCode('VERSION_DELETE_UNAVAILABLE'));
  await f.worker.tick();
  assert.equal((await f.store.get('intakes', duplicate.intake_id))?.version_id, intake.version_id);
  await remove();
  assert.deepEqual(await f.store.where('intakes', 'asset_id', intake.asset_id), []);
  assert.deepEqual(await f.store.where('jobs', 'aggregate_id', duplicate.intake_id), []);
  assert(await f.store.get('assets', intake.asset_id));
});

test('版本删除与重扫并发时只有一个成功，不遗留指向已删除版本的任务', async (context) => {
  const f = await createTestHub(context);
  const intake = await receiveSkill(f);
  const results = await Promise.allSettled([
    f.hub.intakes.rescan(f.admin, intake.id, randomUUID()),
    f.hub.lifecycle.deleteVersion(
      f.admin,
      intake.version_id,
      { reason: '清理草稿' },
      '"1"',
      randomUUID(),
    ),
  ]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  const version = await f.store.get('versions', intake.version_id);
  const remaining = await f.store.where('intakes', 'asset_id', intake.asset_id);
  if (version) {
    assert.equal(remaining.filter((item) => item.rescan_of === intake.id).length, 1);
    await f.worker.tick();
    assert.equal((await f.store.all('jobs')).filter((job) => job.state === 'failed').length, 0);
  } else {
    assert.deepEqual(remaining, []);
    assert.deepEqual(await f.store.all('jobs'), []);
  }
});

test('资源在重扫预检期间删除时返回不存在，且不遗留重扫任务', async (context) => {
  const f = await createTestHub(context);
  const intake = await receiveSkill(f);
  const get = f.store.get.bind(f.store);
  const interception = context.mock.method(
    f.store,
    'get',
    async (table: Parameters<typeof get>[0], id: Parameters<typeof get>[1]) => {
      if (table === 'sources' && id === intake.source_id) {
        interception.mock.restore();
        await f.hub.lifecycle.deleteAsset(
          f.admin,
          intake.asset_id,
          { reason: '清理未发布资源' },
          '"1"',
          randomUUID(),
        );
      }
      return get(table, id);
    },
  );
  await assert.rejects(
    () => f.hub.intakes.rescan(f.admin, intake.id, randomUUID()),
    errorCode('NOT_FOUND'),
  );
  assert.equal(await f.store.get('assets', intake.asset_id), undefined);
  assert.deepEqual(await f.store.all('intakes'), []);
  assert.deepEqual(await f.store.all('jobs'), []);
});

test('正式发布历史在撤销后仍保护资源、版本、扫描与审核记录', async (context) => {
  const f = await createTestHub(context);
  const published = await publishSkill(f);
  await f.hub.lifecycle.revokeVersion(f.admin, published.intake.version_id, '停止分发');
  const asset = await f.hub.assetAccess.getAsset(published.intake.asset_id);
  await f.store.put('assets', { ...asset, current_release_id: null });
  await assert.rejects(
    () =>
      f.hub.lifecycle.deleteAsset(
        f.admin,
        asset.id,
        { reason: '清理' },
        `"${asset.revision}"`,
        randomUUID(),
      ),
    errorCode('ASSET_DELETE_UNAVAILABLE'),
  );
  await assert.rejects(
    () =>
      f.hub.lifecycle.deleteVersion(
        f.admin,
        published.intake.version_id,
        { reason: '清理' },
        `"${asset.revision}"`,
        randomUUID(),
      ),
    errorCode('VERSION_DELETE_UNAVAILABLE'),
  );
  await assert.rejects(() => f.store.remove('versions', published.intake.version_id), /immutable/);
  await assert.rejects(() => f.store.remove('scans', published.intake.scan_run_id), /immutable/);
  await assert.rejects(() => f.store.remove('requests', published.request.id), /immutable/);
  assert(await f.store.get('versions', published.intake.version_id));
  assert.equal((await f.store.where('releases', 'asset_id', asset.id)).length, 1);
});

test('版本删除校验维护权限、资源修订号、幂等键及原因', async (context) => {
  const f = await createTestHub(context);
  const intake = await receiveSkill(f);
  const client = await signIn(f);
  const reader = await signIn(f, 'reader');
  const path = '/api/versions/' + intake.version_id;
  for (const check of [
    { client: reader, etag: '"1"', key: randomUUID(), status: 403 },
    { client, etag: '', key: randomUUID(), status: 428 },
    { client, etag: '"2"', key: randomUUID(), status: 412 },
    { client, etag: '"1"', key: '', status: 400 },
  ])
    await check.client
      .delete(path)
      .set('If-Match', check.etag)
      .set('Idempotency-Key', check.key)
      .send({ reason: '清理草稿' })
      .expect(check.status);
  for (const body of [{ reason: ' ' }, { reason: '清理', force: true }])
    await client
      .delete(path)
      .set('If-Match', '"1"')
      .set('Idempotency-Key', randomUUID())
      .send(body)
      .expect(422);
  assert(await f.store.get('versions', intake.version_id));
});

test('提交审核与版本删除并发时只有一个成功，不留下引用已删除版本的申请', async (context) => {
  const f = await createTestHub(context);
  const intake = await receiveSkill(f);
  const results = await Promise.allSettled([
    f.hub.lifecycle.deleteVersion(
      f.admin,
      intake.version_id,
      { reason: '清理草稿' },
      '"1"',
      randomUUID(),
    ),
    submitPublication(f, intake),
  ]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  const version = await f.store.get('versions', intake.version_id);
  const requests = await f.store.where('requests', 'version_id', intake.version_id);
  assert.equal(requests.length, version ? 1 : 0);
  if (version) assert.equal(requests[0].state, 'pending');
});

function approval(
  request: Awaited<ReturnType<typeof submitPublication>>,
): PublicationDecisionCommand {
  return {
    decision: 'approve',
    comment: '已核对固定内容与分发范围',
    policy_digest: request.policy_digest,
    accepted_warnings: [],
  };
}

const newScene = { name: '数据库迁移演练', description: '验证迁移脚本及回退流程。' };

function scenarioSubmission(
  intake: Awaited<ReturnType<typeof receiveSkill>>,
  team: string,
  definitions: ScenarioDefinition[] = [newScene],
) {
  return {
    source_intake_id: intake.id,
    version_id: intake.version_id,
    base_release_id: null,
    category: 'scenario' as const,
    scenario_ids: [],
    proposed_scenarios: definitions,
    distribution: { mode: 'approved_audience' as const, audience: ['group:' + team] },
    applies_to: {},
    purpose: '共享团队迁移演练流程',
  };
}

test('维护者可随发布定义场景，含新定义的申请只允许独立平台审核', async (context) => {
  const f = await createTestHub(context);
  const intake = await receiveSkill(f);
  const registered = await f.hub.administration.createScenario(f.admin, { name: '发布检查' });
  const body = { ...scenarioSubmission(intake, f.teamId), scenario_ids: [registered.id] };
  const client = await signIn(f, 'reader');
  const submit = () =>
    client.post('/api/publication-requests').set('Idempotency-Key', randomUUID()).send(body);
  await submit().expect(403);
  const role = (await f.store.find('roles', 'key', 'maintainer'))!;
  await f.hub.administration.grantRole(f.admin, {
    principal_id: f.reader.id,
    role_id: role.id,
    scope_type: 'team',
    scope_id: f.teamId,
  });
  await client.post('/api/admin/scenarios').send(newScene).expect(403);
  const posted = await submit().expect(201);
  const request = (await f.store.get('requests', String(posted.body.id)))!;
  assert.deepEqual(request.proposed_scenarios, [newScene]);
  assert.deepEqual(JSON.parse(request.canonical_policy_json).proposed_scenarios, [newScene]);
  assert.deepEqual(
    (await f.hub.catalog.listScenarios(f.reader)).map((s) => s.id),
    [registered.id],
  );
  const reviewRole = (await f.store.find('roles', 'key', 'reviewer'))!;
  const scoped = await f.hub.administration.createUser(f.admin, {
    username: 'scene-reviewer',
    password: testPassword,
    display_name: '场景审核者',
    group_ids: [],
  });
  await f.hub.administration.grantRole(f.admin, {
    principal_id: scoped.id,
    role_id: reviewRole.id,
    scope_type: 'scenario',
    scope_id: registered.id,
  });
  const scopedReviewer = await f.hub.identity.principal(scoped.id);
  const version = (await f.store.get('versions', intake.version_id))!;
  await assert.rejects(
    () => f.hub.assetAccess.requireCandidateAccess(scopedReviewer, version),
    errorCode('FORBIDDEN'),
  );
  await assert.rejects(
    () => f.hub.publicationQueries.getReview(scopedReviewer, request.id),
    errorCode('FORBIDDEN'),
  );
  await assert.rejects(
    () =>
      f.hub.publications.decide(scopedReviewer, request.id, approval(request), '"1"', randomUUID()),
    errorCode('FORBIDDEN'),
  );
  await f.hub.administration.grantRole(f.admin, {
    principal_id: f.reader.id,
    role_id: reviewRole.id,
    scope_type: 'platform',
    scope_id: '',
  });
  const submitter = await f.hub.identity.principal(f.reader.id);
  await assert.rejects(
    () => f.hub.publications.decide(submitter, request.id, approval(request), '"1"', randomUUID()),
    errorCode('SELF_REVIEW'),
  );
  const key = randomUUID();
  for (let i = 0; i < 2; i++)
    await f.hub.publications.decide(f.reviewer, request.id, approval(request), '"1"', key);
  const scenario = (await f.store.find('scenarios', 'name', newScene.name))!;
  const release = (await f.store.all('releases'))[0];
  assert.deepEqual(new Set(release.scenario_ids), new Set([registered.id, scenario.id]));
  assert.equal(release.policy_digest, request.policy_digest);
  assert.equal((await f.hub.catalog.search(null, { scenario_id: scenario.id })).total, 0);
  assert.equal((await f.hub.catalog.search(f.admin, { scenario_id: scenario.id })).total, 1);
  assert.equal((await f.store.where('role_bindings', 'scope_id', scenario.id)).length, 0);
});

test('已有同名同说明的定义在提交时复用 ID，可由对应场景审核者决定', async (context) => {
  const f = await createTestHub(context);
  const existing = await f.hub.administration.createScenario(f.admin, newScene);
  const role = (await f.store.find('roles', 'key', 'reviewer'))!;
  await f.hub.administration.grantRole(f.admin, {
    principal_id: f.reader.id,
    role_id: role.id,
    scope_type: 'scenario',
    scope_id: existing.id,
  });
  const intake = await receiveSkill(f);
  const request = await f.hub.publications.submit(
    f.admin,
    scenarioSubmission(intake, f.teamId),
    randomUUID(),
  );
  assert.deepEqual(request.scenario_ids, [existing.id]);
  assert.equal(request.proposed_scenarios, undefined);
  const reviewer = await f.hub.identity.principal(f.reader.id);
  const result = await f.hub.publications.decide(
    reviewer,
    request.id,
    approval(request),
    '"1"',
    randomUUID(),
  );
  assert.equal(result.state, 'approved');
  assert.equal((await f.store.all('scenarios')).length, 1);
});

test('并发批准复用相同定义；同名异义失败时整份申请不发布', async (context) => {
  const f = await createTestHub(context);
  const requests = [];
  for (const [i, definitions] of [
    [newScene],
    [newScene],
    [
      { name: 'A', description: '另一场景' },
      { ...newScene, description: '不同用途' },
    ],
  ].entries()) {
    const intake = await receiveSkill(f, { slug: 'migration-' + i });
    requests.push(
      await f.hub.publications.submit(
        f.admin,
        scenarioSubmission(intake, f.teamId, definitions),
        randomUUID(),
      ),
    );
  }
  await Promise.all(
    requests
      .slice(0, 2)
      .map((r) => f.hub.publications.decide(f.reviewer, r.id, approval(r), '"1"', randomUUID())),
  );
  const conflicting = requests[2];
  await assert.rejects(
    () =>
      f.hub.publications.decide(
        f.reviewer,
        conflicting.id,
        approval(conflicting),
        '"1"',
        randomUUID(),
      ),
    errorCode('SCENARIO_CONFLICT'),
  );
  const scenarios = await f.store.all('scenarios');
  assert.equal(scenarios.length, 1);
  const releases = await f.store.all('releases');
  assert.equal(releases.length, 2);
  for (const release of releases) assert.deepEqual(release.scenario_ids, [scenarios[0].id]);
  assert.equal((await f.store.get('requests', conflicting.id))?.state, 'pending');
});

test('拒绝、撤回及校验失败不会向目录登记场景', async (context) => {
  const f = await createTestHub(context);
  const body = scenarioSubmission(await receiveSkill(f), f.teamId);
  const client = await signIn(f);
  for (const patch of [
    { category: 'general' },
    { proposed_scenarios: [newScene, newScene] },
    { proposed_scenarios: [{ ...newScene, description: ' ' }] },
    { proposed_scenarios: [{ ...newScene, id: randomUUID() }] },
    { scenario_ids: Array.from({ length: 20 }, () => randomUUID()) },
  ])
    await client
      .post('/api/publication-requests')
      .set('Idempotency-Key', randomUUID())
      .send({ ...body, ...patch })
      .expect(422);
  const rejected = await f.hub.publications.submit(f.admin, body, randomUUID());
  await f.hub.publications.decide(
    f.reviewer,
    rejected.id,
    { ...approval(rejected), decision: 'reject', comment: '调整场景描述' },
    '"1"',
    randomUUID(),
  );
  const cancelled = await f.hub.publications.submit(f.admin, body, randomUUID());
  await f.hub.publications.cancel(f.admin, cancelled.id, { reason: '撤回重填' }, '"1"');
  assert.deepEqual(await f.hub.catalog.listScenarios(f.admin), []);
});

test('未发布内容只能审查，公开发布后匿名用户才能读取固定版本', async (context) => {
  const fixture = await createTestHub(context);
  const { hub } = fixture;
  const intake = await receiveSkill(fixture);
  await assert.rejects(() => hub.catalog.getDetail(null, intake.asset_id), errorCode('NOT_FOUND'));
  await assert.rejects(
    () => hub.assetAccess.requireReadableVersion(fixture.admin, intake.version_id!),
    errorCode('NOT_FOUND'),
  );
  const internal = await fixture.store.get('versions', intake.version_id);
  assert(internal);
  assert(intake.version);
  assert.deepEqual(
    Object.keys(intake.version).sort(),
    [
      'id',
      'asset_id',
      'version_label',
      'content_digest',
      'artifact_digest',
      'manifest',
      'metadata',
      'availability',
      'created_at',
    ].sort(),
  );
  await hub.assetAccess.requireCandidateAccess(fixture.admin, internal);
  await assert.rejects(
    () => hub.assetAccess.requireCandidateAccess(fixture.reader, internal),
    errorCode('FORBIDDEN'),
  );
  const request = await submitPublication(fixture, intake);
  await hub.publications.decide(
    fixture.reviewer,
    request.id,
    approval(request),
    '"1"',
    randomUUID(),
  );
  const catalog = await hub.catalog.search(null, {});
  assert.equal(catalog.total, 1);
  assert.equal(catalog.items[0].slug, 'sample-skill');
  assert.equal(
    (await hub.content.getFile(null, intake.version_id!, 'SKILL.md')).bytes
      .toString()
      .includes('# 工程实践'),
    true,
  );
});

test('提交者无法自审；同一审核幂等键重放不会重复发布或记录成功事件', async (context) => {
  const fixture = await createTestHub(context);
  const request = await submitPublication(fixture, await receiveSkill(fixture));
  const key = randomUUID();
  await assert.rejects(
    () => fixture.hub.publications.decide(fixture.admin, request.id, approval(request), '"1"', key),
    errorCode('SELF_REVIEW'),
  );
  assert.equal((await fixture.store.get('requests', request.id))?.state, 'pending');
  const first = await fixture.hub.publications.decide(
    fixture.reviewer,
    request.id,
    approval(request),
    '"1"',
    key,
  );
  const replay = await fixture.hub.publications.decide(
    fixture.reviewer,
    request.id,
    approval(request),
    '"1"',
    key,
  );
  assert.deepEqual(replay, first);
  assert.equal((await fixture.store.all('releases')).length, 1);
  assert.equal(
    (await fixture.store.all('audit')).filter((event) => event.action === 'publication.approved')
      .length,
    1,
  );
});

test('缺少修订、修订过期或策略摘要不匹配时，审核不改变申请与发布记录', async (context) => {
  const fixture = await createTestHub(context);
  const request = await submitPublication(fixture, await receiveSkill(fixture));
  const decide = (body: PublicationDecisionCommand, etag: string | undefined) =>
    fixture.hub.publications.decide(fixture.reviewer, request.id, body, etag, randomUUID());
  await assert.rejects(() => decide(approval(request), undefined), errorCode('IF_MATCH_REQUIRED'));
  await assert.rejects(() => decide(approval(request), '"0"'), errorCode('REVISION_CONFLICT'));
  await assert.rejects(
    () => decide({ ...approval(request), policy_digest: 'sha256:' + '0'.repeat(64) }, '"1"'),
    errorCode('POLICY_MISMATCH'),
  );
  assert.equal((await fixture.store.all('releases')).length, 0);
  assert.equal((await fixture.store.get('requests', request.id))?.revision, 1);
});

test('两个审核并发提交时只有一个发布结果', async (context) => {
  const fixture = await createTestHub(context);
  const request = await submitPublication(fixture, await receiveSkill(fixture));
  const results = await Promise.allSettled(
    [randomUUID(), randomUUID()].map((key) =>
      fixture.hub.publications.decide(fixture.reviewer, request.id, approval(request), '"1"', key),
    ),
  );
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  const rejected = results.find((result) => result.status === 'rejected');
  assert(rejected?.status === 'rejected');
  assert(errorCode('REVISION_CONFLICT')(rejected.reason));
  assert.equal((await fixture.store.all('releases')).length, 1);
});

test('封禁发生在提交前的异步边界时，提交必须重新读取资源状态', async (context) => {
  const fixture = await createTestHub(context);
  const intake = await receiveSkill(fixture);
  const execute = fixture.hub.idempotency.execute.bind(fixture.hub.idempotency);
  const interception = context.mock.method(
    fixture.hub.idempotency,
    'execute',
    async <T>(
      principal: Parameters<typeof execute>[0],
      route: string,
      key: string | undefined,
      hash: string,
      work: () => T | Promise<T>,
    ) => {
      interception.mock.restore();
      await fixture.hub.lifecycle.updateState(
        fixture.admin,
        intake.asset_id,
        { lifecycle: 'blocked', reason: '暂停分发' },
        '"1"',
      );
      return await execute(principal, route, key, hash, work);
    },
  );
  await assert.rejects(() => submitPublication(fixture, intake), errorCode('UNAVAILABLE'));
  assert.equal((await fixture.store.all('requests')).length, 0);
});

test('当前发布收窄受众后，历史公开链接与目录缓存同步失效', async (context) => {
  const fixture = await createTestHub(context);
  const first = await publishSkill(fixture);
  assert.equal((await fixture.hub.catalog.search(null, {})).total, 1);
  const second = await publishSkill(fixture, {
    assetId: first.intake.asset_id,
    version: '1.1.0',
    distribution: { mode: 'approved_audience', audience: ['group:' + fixture.teamId] },
  });
  assert.equal((await fixture.hub.catalog.search(null, {})).total, 0);
  await assert.rejects(
    () => fixture.hub.assetAccess.requirePublicVersion('skill', 'sample-skill', '1.0.0'),
    errorCode('NOT_FOUND'),
  );
  await assert.rejects(
    () => fixture.hub.assetAccess.requireReadableVersion(fixture.reader, second.intake.version_id!),
    errorCode('NOT_FOUND'),
  );
  assert.equal((await fixture.hub.catalog.search(fixture.admin, {})).total, 1);
});

test('回退生成新的待审申请并保留当前适用条件，审批后指向历史内容', async (context) => {
  const fixture = await createTestHub(context);
  const first = await publishSkill(fixture);
  await publishSkill(fixture, {
    assetId: first.intake.asset_id,
    version: '1.1.0',
    body: '第二版工程实践。',
  });
  const asset = await fixture.hub.assetAccess.getAsset(first.intake.asset_id);
  const current = await fixture.store.get('releases', asset.current_release_id);
  assert(current);
  const rollback = await fixture.hub.lifecycle.requestRollback(
    fixture.admin,
    asset.id,
    {
      target_version_id: first.intake.version_id,
      reason: '回退到已验证的工程实践',
      current_policy_digest: current.policy_digest,
    },
    randomUUID(),
  );
  assert.equal(rollback.state, 'pending');
  assert.deepEqual(rollback.applies_to, current.applies_to);
  assert.equal(
    (await fixture.hub.catalog.getDetail(null, asset.id)).current_release.version_label,
    '1.1.0',
  );
  await fixture.hub.publications.decide(
    fixture.reviewer,
    rollback.id,
    approval(rollback),
    '"1"',
    randomUUID(),
  );
  assert.equal(
    (await fixture.hub.catalog.getDetail(null, asset.id)).current_release.version_label,
    '1.0.0',
  );
  assert.equal((await fixture.store.all('releases')).length, 3);
});

test('撤销来源分发授权后，公开目录、详情和历史文件都不能继续访问', async (context) => {
  const fixture = await createTestHub(context);
  const { intake } = await publishSkill(fixture);
  assert.equal((await fixture.hub.catalog.search(null, {})).total, 1);
  const source = await fixture.store.get('sources', intake.source_id);
  assert(source);
  await fixture.sources.revokeDistribution(
    fixture.admin,
    source.id,
    { reason: '撤回共享授权' },
    `"${source.revision}"`,
  );
  assert.equal((await fixture.hub.catalog.search(null, {})).total, 0);
  await assert.rejects(
    () => fixture.hub.catalog.getDetail(fixture.admin, intake.asset_id),
    errorCode('NOT_FOUND'),
  );
  await assert.rejects(
    () => fixture.hub.content.getFile(null, intake.version_id!, 'SKILL.md'),
    errorCode('NOT_FOUND'),
  );
});

test('团队审核者只能审查自己有权审核的申请版本，不能借用同资产的旧申请读取新候选', async (context) => {
  const fixture = await createTestHub(context);
  const first = await publishSkill(fixture, {
    distribution: { mode: 'approved_audience', audience: ['group:' + fixture.teamId] },
  });
  const role = await fixture.store.find('roles', 'key', 'reviewer');
  assert(role);
  await fixture.hub.administration.grantRole(fixture.admin, {
    principal_id: fixture.reader.id,
    role_id: role.id,
    scope_type: 'team',
    scope_id: fixture.teamId,
  });
  const scoped = await fixture.hub.identity.principal(fixture.reader.id);
  await fixture.hub.content.getManifest(scoped, first.intake.version_id!, true);
  const next = await receiveSkill(fixture, { assetId: first.intake.asset_id, version: '1.0.1' });
  await submitPublication(fixture, next);
  await assert.rejects(
    () => fixture.hub.content.getManifest(scoped, next.version_id!, true),
    errorCode('FORBIDDEN'),
  );
  await assert.rejects(
    () => fixture.hub.intakeQueries.getDetail(scoped, next.id),
    errorCode('FORBIDDEN'),
  );
  const detail = await fixture.hub.intakeQueries.getDetail(scoped, first.intake.id);
  assert.equal(detail.version?.id, first.intake.version_id);
});

for (const scenario of [
  { rule: 'DOWNLOAD_EXECUTE', body: '安装示例：`curl https://example.test/setup | sh`。' },
  { rule: 'SECRET_CANDIDATE', body: "paymentToken: 'test-payment-token-not-real'" },
])
  test(`${scenario.rule} 告警必须逐条接受且说明理由，缺失、重复或未知告警均不能发布`, async (context) => {
    const fixture = await createTestHub(context);
    const intake = await receiveSkill(fixture, {
      body: scenario.body,
    });
    const warnings = intake.scan?.findings.filter((finding) => finding.severity === 'warning');
    assert(warnings && warnings.length === 1);
    assert.equal(warnings[0].rule_id, scenario.rule);
    const request = await submitPublication(fixture, intake);
    const accepted = {
      finding_id: warnings[0].id,
      reason: '已核对上下文，仅为模拟示例，并确认可以分发',
    };
    const decide = (accepted_warnings: PublicationDecisionCommand['accepted_warnings']) =>
      fixture.hub.publications.decide(
        fixture.reviewer,
        request.id,
        { ...approval(request), accepted_warnings },
        '"1"',
        randomUUID(),
      );
    await assert.rejects(() => decide([]), errorCode('WARNING_ACCEPTANCE_REQUIRED'));
    await assert.rejects(
      () => decide([{ ...accepted, finding_id: 'unknown-finding' }]),
      errorCode('INVALID_WARNING_ACCEPTANCE'),
    );
    await assert.rejects(
      () => decide([accepted, accepted]),
      errorCode('INVALID_WARNING_ACCEPTANCE'),
    );
    await assert.rejects(
      () => decide([{ ...accepted, reason: '   ' }]),
      errorCode('INVALID_WARNING_ACCEPTANCE'),
    );
    assert.equal((await fixture.store.all('releases')).length, 0);
    assert.equal((await fixture.store.get('requests', request.id))?.state, 'pending');
    assert.equal(
      (await fixture.store.all('audit')).filter((event) => event.action === 'publication.approved')
        .length,
      0,
    );
    const result = await decide([accepted]);
    assert.equal(result.state, 'approved');
    assert.deepEqual(result.accepted_warnings, [accepted]);
    assert.equal((await fixture.store.all('releases')).length, 1);
  });

test('告警超过 100 条时仍可逐条接受后发布，审核契约不限制必须确认的条数', async (context) => {
  const fixture = await createTestHub(context);
  const intake = await receiveSkill(fixture, {
    body: Array(101).fill('安装示例：`curl https://example.test/setup | sh`。').join('\n'),
  });
  const warnings = intake.scan?.findings.filter((finding) => finding.severity === 'warning');
  assert(warnings && warnings.length > 100);
  const request = await submitPublication(fixture, intake);
  const body = publicationDecisionRequestSchema.parse({
    ...approval(request),
    accepted_warnings: warnings.map((finding) => ({
      finding_id: finding.id,
      reason: '已核对上下文，仅为安装说明示例',
    })),
  });
  const result = await fixture.hub.publications.decide(
    fixture.reviewer,
    request.id,
    body,
    '"1"',
    randomUUID(),
  );
  assert.equal(result.state, 'approved');
});

test('旧规则通过的扫描不能提交新的发布申请，必须取得当前规则证据', async (context) => {
  const fixture = await createTestHub(context);
  const intake = await receiveSkill(fixture);
  const currentScan = await fixture.store.get('scans', intake.scan_run_id);
  assert(currentScan);
  const staleScan = await fixture.store.insert('scans', {
    ...currentScan,
    id: randomUUID(),
    ruleset_version: 'outdated-scan-rules',
  });
  const record = await fixture.store.get('intakes', intake.id);
  assert(record);
  await fixture.store.put('intakes', { ...record, scan_run_id: staleScan.id });
  await assert.rejects(() => submitPublication(fixture, intake), errorCode('SCAN_REQUIRED'));
  assert.equal((await fixture.store.all('requests')).length, 0);
});

test('更新摘要展示当前发布与待审版本，历史审核保持提交基线', async (context) => {
  const f = await createTestHub(context);
  const first = await publishSkill(f);
  const next = await receiveSkill(f, {
    assetId: first.intake.asset_id,
    version: '1.0.1',
    body: '# 更新后的工程实践',
  });
  assert.equal(next.current_version?.version_label, '1.0.0');
  assert.equal(next.current_version?.content_digest, first.intake.version?.content_digest);
  const request = await submitPublication(f, next);
  const {
    items: [managed],
  } = await f.hub.assetManagement.list(f.admin);
  assert.equal(managed.current_version?.version_label, '1.0.0');
  assert.deepEqual(managed.pending_requests, [
    { id: request.id, version_label: '1.0.1', context_valid: true },
  ]);
  assert.equal(managed.latest_intake?.id, next.id);
  assert.equal(managed.latest_intake?.state, 'pending');
  assert.deepEqual((await f.hub.assetManagement.list(f.reader)).items, []);
  await f.hub.publications.decide(f.reviewer, request.id, approval(request), '"1"', randomUUID());
  const review = await f.hub.publicationQueries.getReview(f.admin, request.id);
  assert.equal(review.current?.content_digest, first.intake.version?.content_digest);
  assert.equal(review.current?.version_label, '1.0.0');
  const {
    items: [published],
  } = await f.hub.assetManagement.list(f.admin);
  assert.equal(published.current_version?.version_label, '1.0.1');
  assert.equal(published.latest_intake?.state, 'approved');
  assert.deepEqual(published.pending_requests, []);
  const refreshed = await f.hub.intakeQueries.getDetail(f.admin, next.id);
  assert.equal(refreshed.current_version?.version_label, '1.0.1');
  assert.notEqual(refreshed.current_release_id, next.current_release_id);
});
