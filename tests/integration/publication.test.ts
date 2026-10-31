import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import type { PublicationDecisionCommand } from '@capability-hub/application';
import { HubError } from '@capability-hub/domain/errors';
import {
  createTestHub,
  publishSkill,
  receiveSkill,
  submitPublication,
} from '../support/application.js';

const errorCode = (code: string) => (error: unknown) =>
  error instanceof HubError && error.code === code;

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
  const [managed] = await f.hub.assetManagement.list(f.admin);
  assert.equal(managed.current_version?.version_label, '1.0.0');
  assert.deepEqual(managed.pending_requests, [{ id: request.id, version_label: '1.0.1' }]);
  assert.equal(managed.latest_intake?.id, next.id);
  assert.equal(managed.latest_intake?.state, 'pending');
  assert.deepEqual(await f.hub.assetManagement.list(f.reader), []);
  await f.hub.publications.decide(f.reviewer, request.id, approval(request), '"1"', randomUUID());
  const review = await f.hub.publicationQueries.getReview(f.admin, request.id);
  assert.equal(review.current?.content_digest, first.intake.version?.content_digest);
  assert.equal(review.current?.version_label, '1.0.0');
  const [published] = await f.hub.assetManagement.list(f.admin);
  assert.equal(published.current_version?.version_label, '1.0.1');
  assert.equal(published.latest_intake?.state, 'approved');
  assert.deepEqual(published.pending_requests, []);
  const refreshed = await f.hub.intakeQueries.getDetail(f.admin, next.id);
  assert.equal(refreshed.current_version?.version_label, '1.0.1');
  assert.notEqual(refreshed.current_release_id, next.current_release_id);
});
