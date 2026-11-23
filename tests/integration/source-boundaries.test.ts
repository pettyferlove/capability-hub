import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { createServer, type Socket } from 'node:net';
import { tmpdir } from 'node:os';
import { SourceSyncService } from '@capability-hub/application';
import type { GitRepository } from '@capability-hub/application/ports';
import { canonical, digest } from '@capability-hub/domain/canonical';
import { HubError } from '@capability-hub/domain/errors';
import { archive } from '@capability-hub/infrastructure/content';
import { GitRepositoryAdapter } from '@capability-hub/infrastructure/git';
import {
  createTestHub,
  publishSkill,
  submitPublication,
  testPassword,
  type TestHub,
} from '../support/application.js';
import { skillDocument } from '../support/content.js';
import { deferred } from '../support/store.js';

async function sources(context: TestContext) {
  const fixture = await createTestHub(context, {
    gitHosts: ['127.0.0.1'],
    privateGitHosts: ['127.0.0.1'],
  });
  const policy = {
    category: 'uncategorized' as const,
    scenario_ids: [],
    distribution: { mode: 'approved_audience' as const, audience: ['group:' + fixture.teamId] },
  };
  async function create(slug: string, path: string, credentialRef?: string) {
    return fixture.sources.create(
      fixture.admin,
      {
        repository_url: `https://127.0.0.1/team/${slug}.git`,
        provider: 'generic-git',
        branch: 'main',
        ...(credentialRef ? { credential_ref: credentialRef } : {}),
        owner_group_id: fixture.teamId,
        targets: [{ ...policy, slug, kind: 'skill', path }],
      },
      randomUUID(),
    );
  }
  return { ...fixture, create };
}

const code = (expected: string) => (error: unknown) =>
  error instanceof HubError && error.code === expected;

async function syncSource(fixture: TestHub, sourceId: string) {
  const { job_id } = await fixture.sources.sync(fixture.admin, sourceId, randomUUID());
  await fixture.worker.tick();
  const job = await fixture.store.get('jobs', job_id);
  assert(job?.kind === 'source_sync');
  return job;
}

async function syncedIntake(fixture: TestHub, sourceId: string) {
  const target = (await syncSource(fixture, sourceId)).result?.targets[0];
  assert.equal(target?.state, 'ready');
  assert(target);
  const detail = await fixture.hub.intakeQueries.getDetail(fixture.admin, target.intake_id);
  assert(detail.version_id && detail.scan_run_id);
  return { ...detail, version_id: detail.version_id, scan_run_id: detail.scan_run_id };
}

test('自动轮询只返回已到期且未暂停或撤销的 Git 来源', async (context) => {
  const fixture = await sources(context);
  const created = await fixture.create('poll-boundaries', '.');
  const source = await fixture.store.get('sources', created.id);
  assert(source?.kind === 'git');
  const now = Date.now();
  const dueIds: string[] = [];
  for (const [state, offset, revoked] of [
    ['active', -1, false],
    ['active', 0, false],
    ['active', 1, false],
    ['paused', -1, false],
    ['blocked', -1, false],
    ['auth_error', -1, false],
    ['active', -1, true],
  ] as const) {
    const id = randomUUID();
    await fixture.store.insert('sources', {
      ...source,
      id,
      state,
      next_poll_at: now + offset,
      ...(revoked ? { distribution_revoked_at: new Date(now).toISOString() } : {}),
    });
    if (state === 'active' && offset <= 0 && !revoked) dueIds.push(id);
  }
  await fixture.store.insert('sources', {
    id: randomUUID(),
    kind: 'upload',
    owner_group_id: fixture.teamId,
    state: 'active',
    generation: 1,
    revision: 1,
    created_at: new Date(now).toISOString(),
  });
  assert.deepEqual(
    (await fixture.store.listDueSources(now)).map((item) => item.id),
    dueIds.sort(),
  );
});

test('账号停用永久撤销已有网页会话和个人令牌，重新启用也不能恢复旧凭据', async (context) => {
  const fixture = await createTestHub(context);
  const user = await fixture.hub.identity.activeUser(fixture.reader.id);
  const session = await fixture.hub.sessions.create(user);
  const token = await fixture.hub.tokens.issue(fixture.reader, { name: '停用前令牌' });
  await fixture.hub.administration.updateUser(fixture.admin, user.id, { active: false }, '"1"');
  assert.equal(await fixture.hub.sessions.find(session.token), undefined);
  assert.notEqual((await fixture.hub.tokens.find(token.token))?.revoked_at, null);
  await fixture.hub.administration.updateUser(fixture.admin, user.id, { active: true }, '"2"');
  assert.equal(
    (await fixture.hub.authentication.login(user.username, testPassword, 'test-address')).id,
    user.id,
  );
  assert.notEqual((await fixture.hub.tokens.find(token.token))?.revoked_at, null);
});

test('Git 资产不能用手工归档冒充固定仓库快照，拒绝时不写入接收记录或作业', async (context) => {
  const fixture = await sources(context);
  const source = await fixture.create('git-skill', 'skills/git-skill');
  const bytes = await archive([
    { path: 'SKILL.md', bytes: skillDocument('git-skill'), executable: false },
  ]);
  await assert.rejects(
    () =>
      fixture.hub.intakes.receive(
        fixture.admin,
        bytes,
        'skill.zip',
        { target: 'existing', asset_id: source.targets[0].asset_id, version_label: '1.0.0' },
        randomUUID(),
      ),
    code('UPLOAD_SOURCE_REQUIRED'),
  );
  assert.deepEqual(await fixture.store.all('intakes'), []);
  assert.deepEqual(await fixture.store.all('jobs'), []);
});

test('迁移检查忽略大小写的父子路径重叠，失败时原来源和绑定不变', async (context) => {
  const fixture = await sources(context);
  const published = await publishSkill(fixture);
  const destination = await fixture.create('destination-skill', 'Skills/Base');
  const asset = await fixture.hub.assetAccess.getAsset(published.intake.asset_id);
  await assert.rejects(
    () =>
      fixture.hub.lifecycle.migrateSource(
        fixture.admin,
        asset.id,
        {
          destination_source_id: destination.id,
          destination_source_revision: destination.revision,
          path: 'skills/base/nested',
          reason: '迁移测试',
        },
        `"${asset.revision}"`,
      ),
    code('OVERLAPPING_PATH'),
  );
  assert.equal((await fixture.store.get('assets', asset.id))?.source_id, asset.source_id);
  assert.equal((await fixture.store.where('bindings', 'asset_id', asset.id)).length, 0);
});

test('来源迁移将当前发布的适用条件保留在新读取绑定', async (context) => {
  const fixture = await sources(context);
  const published = await publishSkill(fixture);
  const destination = await fixture.create('destination-skill', 'skills/other');
  const asset = await fixture.hub.assetAccess.getAsset(published.intake.asset_id);
  const release = await fixture.store.get('releases', asset.current_release_id);
  assert(release);
  const moved = await fixture.hub.lifecycle.migrateSource(
    fixture.admin,
    asset.id,
    {
      destination_source_id: destination.id,
      destination_source_revision: destination.revision,
      path: 'skills/moved',
      reason: '迁移正本',
    },
    `"${asset.revision}"`,
  );
  assert.deepEqual(
    (await fixture.store.get('bindings', moved.binding_id))?.applies_to,
    release.applies_to,
  );
});

test('Git 来源认证恢复后，第一次重新同步即可接收目标', async (context) => {
  const fixture = await sources(context);
  const source = await fixture.create('recovered-skill', '.');
  let authenticated = false;
  context.mock.method(fixture.hub.git, 'snapshot', async () => {
    if (!authenticated) throw new HubError(502, 'GIT_AUTH_ERROR', '来源认证失败');
    return {
      commit: '1'.repeat(40),
      read: async () => [
        { path: 'SKILL.md', bytes: skillDocument('recovered-skill'), executable: false },
      ],
      close: () => Promise.resolve(),
    };
  });
  assert.equal((await syncSource(fixture, source.id)).last_error_code, 'GIT_AUTH_ERROR');
  assert.equal((await fixture.store.get('sources', source.id))?.state, 'auth_error');
  authenticated = true;
  const recovered = await syncSource(fixture, source.id);
  assert.equal(recovered.result?.targets[0].state, 'ready');
  assert.equal((await fixture.store.get('sources', source.id))?.state, 'active');
});

test('Git 来源更新后只复用当前修订的同步任务', async (context) => {
  const fixture = await sources(context);
  const source = await fixture.create('edited-skill', '.');
  const request = () => fixture.sources.sync(fixture.admin, source.id, randomUUID());
  const old = await request();
  const updated = await fixture.sources.patch(fixture.admin, source.id, { branch: 'next' }, '"1"');
  const current = await request();
  assert.notEqual(current.job_id, old.job_id);
  assert.equal(current.source_revision, updated.revision);
  assert.equal((await request()).job_id, current.job_id);
});

test('撤销分发的 Git 来源不能通过编辑恢复同步，旧活动状态也不能拉取', async (context) => {
  const fixture = await sources(context);
  const source = await fixture.create('revoked-skill', '.');
  await fixture.sources.revokeDistribution(fixture.admin, source.id, { reason: '停止分发' }, '"1"');
  await assert.rejects(
    () => fixture.sources.patch(fixture.admin, source.id, { state: 'active' }, '"2"'),
    code('SOURCE_BLOCKED'),
  );
  const revoked = await fixture.store.get('sources', source.id);
  assert(revoked?.kind === 'git' && revoked.distribution_revoked_at);
  await fixture.store.put('sources', { ...revoked, state: 'active', next_poll_at: 0 });
  assert.equal((await fixture.sources.get(fixture.admin, source.id)).state, 'blocked');
  await assert.rejects(
    () => fixture.sources.sync(fixture.admin, source.id, randomUUID()),
    code('SOURCE_NOT_ACTIVE'),
  );
  context.mock.method(fixture.hub.git, 'snapshot', async () => {
    throw new Error('已撤销的来源仍在访问 Git');
  });
  await fixture.worker.tick();
  assert.equal((await fixture.store.where('jobs', 'aggregate_id', source.id)).length, 0);
  const queued = await fixture.hub.jobs.enqueue('source_sync', source.id, {
    source_revision: revoked.revision,
    requested_by: fixture.admin.id,
  });
  await fixture.worker.tick();
  assert.equal(
    (await fixture.store.get('jobs', queued.id))?.last_error_code,
    'SOURCE_CONFIG_CHANGED',
  );
});

test('删除 Git 目标更新来源修订并使其他目标的待审申请失效', async (context) => {
  const f = await sources(context);
  const source = await f.sources.create(
    f.admin,
    {
      repository_url: 'https://127.0.0.1/team/deletion.git',
      provider: 'generic-git',
      branch: 'main',
      owner_group_id: f.teamId,
      targets: ['deleted-skill', 'remaining-skill'].map((slug) => ({
        slug,
        kind: 'skill',
        path: slug,
        category: 'uncategorized',
        scenario_ids: [],
        distribution: { mode: 'approved_audience', audience: ['group:' + f.teamId] },
        applies_to: {},
      })),
    },
    randomUUID(),
  );
  context.mock.method(f.hub.git, 'snapshot', async () => ({
    commit: 'a'.repeat(40),
    read: async (path: string) => [
      { path: 'SKILL.md', bytes: skillDocument(path), executable: false },
    ],
    close: () => Promise.resolve(),
  }));
  assert.equal((await syncSource(f, source.id)).state, 'succeeded');
  const survivor = source.targets.find((target) => target.slug === 'remaining-skill')!;
  const [received] = await f.store.where('intakes', 'asset_id', survivor.asset_id);
  const intake = await f.hub.intakeQueries.getDetail(f.admin, received.id);
  assert(intake.version_id && intake.scan_run_id);
  const request = await submitPublication(f, {
    ...intake,
    version_id: intake.version_id,
    scan_run_id: intake.scan_run_id,
  });
  const asset = await f.hub.assetAccess.getAsset('deleted-skill');
  await f.hub.lifecycle.deleteAsset(
    f.admin,
    asset.id,
    { reason: '移除未发布目标' },
    `"${asset.revision}"`,
    randomUUID(),
  );
  const remaining = await f.sources.get(f.admin, source.id);
  assert.equal(remaining.revision, source.revision + 1);
  assert.equal(remaining.state, 'active');
  assert.deepEqual(
    remaining.targets.map((target) => target.asset_id),
    [survivor.asset_id],
  );
  const stale = await f.store.get('requests', request.id);
  assert.equal(stale?.state, 'stale');
  assert.equal(stale?.stale_reason, 'SOURCE_CONFIG_CHANGED');
  assert.equal(stale?.revision, request.revision + 1);
  await assert.rejects(
    () => f.sources.patch(f.admin, source.id, { branch: 'next' }, `"${source.revision}"`),
    code('REVISION_CONFLICT'),
  );
});

test('来源读取与删除目标并发时，修订号和目标列表保持同一快照', async (context) => {
  const f = await sources(context);
  const source = await f.create('deleted-skill', '.');
  const asset = await f.hub.assetAccess.getAsset(source.targets[0].asset_id);
  const [before] = await Promise.all([
    f.sources.get(f.admin, source.id),
    f.hub.lifecycle.deleteAsset(
      f.admin,
      asset.id,
      { reason: '清理最后一个未发布目标' },
      `"${asset.revision}"`,
      randomUUID(),
    ),
  ]);
  assert.deepEqual(before, source);
  const after = await f.sources.get(f.admin, source.id);
  assert.equal(after.revision, source.revision + 1);
  assert.equal(after.state, 'paused');
  assert.deepEqual(after.targets, []);
});

test('同一轮询周期内再次修改 Git 来源也会按新修订同步', async (context) => {
  const fixture = await sources(context);
  const source = await fixture.create('polled-skill', '.');
  const time = Date.now();
  context.mock.method(Date, 'now', () => time);
  context.mock.method(fixture.hub.git, 'snapshot', async () => ({
    commit: 'a'.repeat(40),
    read: async () => [
      { path: 'SKILL.md', bytes: skillDocument('polled-skill'), executable: false },
    ],
    close: () => Promise.resolve(),
  }));
  for (const [index, branch] of ['next', 'main'].entries()) {
    const updated = await fixture.sources.patch(
      fixture.admin,
      source.id,
      { branch },
      `"${index + 1}"`,
    );
    await fixture.worker.tick();
    const observed = await fixture.sources.get(fixture.admin, source.id);
    assert.equal(observed.last_observed_revision, updated.revision);
  }
});

test('无内容变化的 Git 轮询保留维护动态与待办状态', async (context) => {
  context.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-11-01T00:00:00Z') });
  const f = await sources(context);
  const source = await f.create('unchanged-skill', '.');
  let commit = 'a'.repeat(40);
  let body = '原始内容';
  context.mock.method(f.hub.git, 'snapshot', async () => ({
    commit,
    read: async () => [
      { path: 'SKILL.md', bytes: skillDocument('unchanged-skill', body), executable: false },
    ],
    close: () => Promise.resolve(),
  }));
  await syncSource(f, source.id);
  const [intake] = await f.store.all('intakes');
  const detail = await f.hub.intakeQueries.getDetail(f.admin, intake.id);
  assert(detail.version_id && detail.scan_run_id);
  context.mock.timers.tick(1000);
  const request = await submitPublication(f, {
    ...detail,
    version_id: detail.version_id,
    scan_run_id: detail.scan_run_id,
  });
  await f.hub.publications.decide(
    f.reviewer,
    request.id,
    {
      decision: 'approve',
      comment: '已核对',
      policy_digest: request.policy_digest,
      accepted_warnings: [],
    },
    '"1"',
    randomUUID(),
  );
  const before = (await f.hub.assetManagement.list(f.admin)).items[0].latest_activity;
  for (const nextCommit of ['b'.repeat(40), 'b'.repeat(40), 'c'.repeat(40)]) {
    context.mock.timers.tick(1000);
    commit = nextCommit;
    const current = await f.store.get('sources', source.id);
    assert(current?.kind === 'git');
    await f.store.put('sources', { ...current, next_poll_at: 0 });
    await f.worker.tick();
    const asset = (await f.hub.assetManagement.list(f.admin)).items[0];
    assert.deepEqual(asset.latest_activity, before);
    assert.equal(asset.needs_attention, false);
  }
  assert.equal((await f.store.all('versions')).length, 1);
  const latest = (await f.hub.assetManagement.list(f.admin)).items[0].latest_intake;
  assert(latest);
  const candidate = await f.hub.intakeQueries.getDetail(f.admin, latest.id);
  assert(candidate.version_id && candidate.scan_run_id);
  context.mock.timers.tick(1000);
  const resubmitted = await submitPublication(f, {
    ...candidate,
    version_id: candidate.version_id,
    scan_run_id: candidate.scan_run_id,
  });
  await f.hub.publications.decide(
    f.reviewer,
    resubmitted.id,
    {
      decision: 'reject',
      comment: '需要补充使用说明',
      policy_digest: resubmitted.policy_digest,
      accepted_warnings: [],
    },
    '"1"',
    randomUUID(),
  );
  const rejected = (await f.hub.assetManagement.list(f.admin)).items[0];
  assert.equal(rejected.needs_attention, true);
  context.mock.timers.tick(1000);
  commit = 'd'.repeat(40);
  await syncSource(f, source.id);
  const unchanged = (await f.hub.assetManagement.list(f.admin)).items[0];
  assert.deepEqual(unchanged.latest_activity, rejected.latest_activity);
  assert.equal(unchanged.latest_intake?.state, 'rejected');
  assert.equal(unchanged.needs_attention, true);
  context.mock.timers.tick(1000);
  commit = 'e'.repeat(40);
  body = '更新后的内容';
  await syncSource(f, source.id);
  const after = (await f.hub.assetManagement.list(f.admin)).items[0];
  assert.equal(after.latest_activity.label, '校验通过');
  assert(after.latest_activity.occurred_at > before.occurred_at);
  assert.equal(after.latest_intake?.state, 'ready');
  assert.equal(after.needs_attention, true);
});

test('Git 贡献者区分人工同步和系统轮询，后续同步不改写已有版本的发起人', async (context) => {
  const f = await sources(context);
  const source = await f.create('attributed-skill', '.');
  let commit = 'a'.repeat(40);
  context.mock.method(f.hub.git, 'snapshot', async () => ({
    commit,
    read: async () => [
      { path: 'SKILL.md', bytes: skillDocument('attributed-skill', commit), executable: false },
    ],
    close: () => Promise.resolve(),
  }));
  const manual = await syncSource(f, source.id);
  assert.equal(manual.state, 'succeeded');
  const firstVersionId = manual.result?.targets[0].version_id;
  assert(firstVersionId);
  const person = {
    source_kind: 'git',
    actor: { kind: 'user', name: f.admin.display_name, username: f.admin.username },
  };
  assert.deepEqual((await f.hub.assetManagement.list(f.admin)).items[0].latest_contributor, person);
  commit = 'b'.repeat(40);
  const current = await f.store.get('sources', source.id);
  assert(current?.kind === 'git');
  await f.store.put('sources', { ...current, next_poll_at: 0 });
  await f.worker.tick();
  const system = { source_kind: 'git', actor: { kind: 'system', name: '系统任务' } };
  assert.deepEqual((await f.hub.assetManagement.list(f.admin)).items[0].latest_contributor, system);
  const versions = await f.hub.assetManagement.versions(f.admin, source.targets[0].asset_id);
  assert.equal(versions.length, 2);
  assert.deepEqual(versions.find((v) => v.version_id === firstVersionId)?.contributor, person);
  assert.deepEqual(versions.find((v) => v.version_id !== firstVersionId)?.contributor, system);
  const events = (await f.store.all('audit')).filter(
    (event) => event.action === 'source.sync_requested',
  );
  assert.deepEqual(events.map((event) => event.actor_id).sort(), [f.admin.id, 'system'].sort());
});

for (const stage of ['读取目标', '保存扫描快照'] as const) {
  test(`Git ${stage}期间轮换凭据会阻止创建版本，同一提交可用新凭据重新接收`, async (context) => {
    const fixture = await sources(context);
    const input = {
      name: '仓库读取',
      kind: 'token',
      host: '127.0.0.1',
      secret: 'fixture-token-v1',
    };
    const credential = await fixture.hub.credentials.save(fixture.admin, input);
    const source = await fixture.create('rotated-skill', '.', credential.id);
    let rotated = false;
    async function rotate() {
      if (rotated) return;
      rotated = true;
      await fixture.hub.credentials.save(
        fixture.admin,
        { ...input, secret: 'fixture-token-v2' },
        credential.id,
        '"1"',
      );
    }
    context.mock.method(fixture.hub.git, 'snapshot', async () => ({
      commit: 'a'.repeat(40),
      credential_revision: await fixture.hub.credentials.currentRevision(credential.id),
      read: async () => {
        if (stage === '读取目标') await rotate();
        return [{ path: 'SKILL.md', bytes: skillDocument('rotated-skill'), executable: false }];
      },
      close: () => Promise.resolve(),
    }));
    if (stage === '保存扫描快照') {
      const put = fixture.blobs.put.bind(fixture.blobs);
      context.mock.method(fixture.blobs, 'put', async (bytes: Buffer) => {
        await rotate();
        return put(bytes);
      });
    }
    assert.equal((await syncSource(fixture, source.id)).last_error_code, 'CREDENTIAL_CHANGED');
    assert.equal((await fixture.store.all('versions')).length, 0);
    assert.equal((await fixture.store.get('sources', source.id))?.state, 'active');
    const [interrupted] = await fixture.store.where('intakes', 'source_id', source.id);
    assert.equal(interrupted.state, 'cancelled');
    assert.equal(interrupted.error_code, 'CREDENTIAL_CHANGED');
    // 已有实例可能把凭据失效保存为不可重试的目标失败。
    await fixture.store.put('intakes', { ...interrupted, state: 'failed', retryable: false });
    const recovered = await syncSource(fixture, source.id);
    assert.equal(recovered.result?.targets[0].state, 'ready');
    assert.equal((await fixture.store.all('versions')).length, 1);
  });
}

test('Worker 接管中断的 Git 同步会结束旧接收记录，不留下仍在读取的目标', async (context) => {
  const fixture = await sources(context);
  const source = await fixture.create('reclaimed-skill', '.');
  const entered = deferred(),
    release = deferred();
  let interrupted = false;
  context.mock.method(fixture.hub.git, 'snapshot', async () => ({
    commit: 'b'.repeat(40),
    read: async () => {
      if (!interrupted) {
        interrupted = true;
        entered.resolve();
        await release.promise;
      }
      return [{ path: 'SKILL.md', bytes: skillDocument('reclaimed-skill'), executable: false }];
    },
    close: () => Promise.resolve(),
  }));
  await fixture.sources.sync(fixture.admin, source.id, randomUUID());
  const first = await fixture.hub.jobs.claim('worker-1');
  assert(first?.kind === 'source_sync');
  const lost = assert.rejects(fixture.hub.sourceSync.process(first), code('LEASE_LOST'));
  await entered.promise;
  try {
    context.mock.method(Date, 'now', () => first.lease_until);
    const next = await fixture.hub.jobs.claim('worker-2');
    assert(next?.kind === 'source_sync' && next.id === first.id);
    await fixture.hub.sourceSync.process(next);
    await fixture.hub.jobs.withLease(next, async (current) => {
      await fixture.store.put('jobs', { ...current, state: 'succeeded', lease_until: 0 });
    });
  } finally {
    release.resolve();
    await lost;
  }
  const intakes = await fixture.store.where('intakes', 'source_sync_job_id', first.id);
  assert.deepEqual(intakes.map((intake) => intake.state).sort(), ['cancelled', 'ready']);
  const abandoned = intakes.find((intake) => intake.state === 'cancelled')!;
  // 旧实例可能留下作业已结束、接收仍为 fetching 的记录。
  await fixture.store.put('intakes', { ...abandoned, state: 'fetching', finished_at: null });
  await syncSource(fixture, source.id);
  assert.equal((await fixture.store.get('intakes', abandoned.id))?.state, 'cancelled');
});

test('Git 同提交同步不复用临时失败或过期扫描规则的接收证据', async (context) => {
  const fixture = await sources(context);
  const source = await fixture.create('transient-skill', 'skills/transient');
  let unavailable = true;
  let reads = 0;
  const git: GitRepository = {
    validate: (url) => fixture.hub.git.validate(url),
    branch: (branch) => fixture.hub.git.branch(branch),
    snapshot: async () => ({
      commit: '1'.repeat(40),
      close: () => Promise.resolve(),
      read: async () => {
        reads++;
        if (unavailable) throw new HubError(503, 'SCANNER_UNAVAILABLE', '扫描器暂不可用', {}, true);
        return [{ path: 'SKILL.md', bytes: skillDocument('transient-skill'), executable: false }];
      },
    }),
  };
  const sync = new SourceSyncService(
    { store: fixture.store, blobs: fixture.blobs, identity: fixture.hub.identity },
    fixture.hub.assetAccess,
    fixture.hub.intakeProcessor,
    fixture.hub.jobs,
    git,
    fixture.hub.credentials,
  );
  async function process() {
    await fixture.sources.sync(fixture.admin, source.id, randomUUID());
    const job = await fixture.hub.jobs.claim('controlled-worker');
    assert(job?.kind === 'source_sync');
    await sync.process(job);
    await fixture.hub.jobs.withLease(job, (current) =>
      fixture.store.put('jobs', {
        ...current,
        state: 'succeeded',
        lease_until: 0,
        finished_at: new Date().toISOString(),
      }),
    );
  }
  await process();
  unavailable = false;
  await process();
  assert.equal(reads, 2);
  const intakes = await fixture.store.where('intakes', 'source_id', source.id);
  assert.deepEqual(intakes.map((intake) => intake.state).sort(), ['failed', 'ready']);
  const failed = intakes.find((intake) => intake.state === 'failed');
  assert(failed);
  assert.equal(failed.retryable, true);
  assert.equal(
    (await fixture.hub.intakeQueries.getDetail(fixture.admin, failed.id)).retryable,
    false,
  );
  const ready = intakes.find((intake) => intake.state === 'ready');
  assert(ready);
  await fixture.store.put('intakes', { ...ready, processing_ruleset: 'outdated-scan-rules' });
  await process();
  assert.equal(reads, 3);
  assert.equal((await fixture.store.where('versions', 'asset_id', ready.asset_id)).length, 1);
  assert.equal((await fixture.store.all('scans')).length, 2);
});

test('Git 重验已发布的相同内容不产生待提交事项，内容或来源策略变化仍待提交', async (context) => {
  context.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-11-01T00:00:00Z') });
  const f = await sources(context);
  const slug = 'recheck-published';
  const source = await f.create(slug, '.');
  let commit = 'a'.repeat(40);
  let text = '已发布的内容';
  context.mock.method(f.hub.git, 'snapshot', async () => ({
    commit,
    read: async () => [{ path: 'SKILL.md', bytes: skillDocument(slug, text), executable: false }],
    close: () => Promise.resolve(),
  }));
  const original = await syncedIntake(f, source.id);
  const submitted = await submitPublication(f, original);
  await f.hub.publications.decide(
    f.reviewer,
    submitted.id,
    {
      decision: 'approve',
      comment: '核对原始版本',
      policy_digest: submitted.policy_digest,
      accepted_warnings: [],
    },
    '"1"',
    randomUUID(),
  );
  const before = (await f.hub.assetManagement.list(f.admin)).items[0];
  const record = await f.store.get('intakes', original.id);
  const version = await f.store.get('versions', original.version_id);
  const scan = await f.store.get('scans', original.scan_run_id);
  assert(record && version && scan);
  await f.store.put('intakes', { ...record, processing_ruleset: 'previous-rules' });
  const duplicateVersionId = randomUUID();
  const duplicateIntakeId = randomUUID();
  const duplicateCommit = 'b'.repeat(40);
  const duplicateLabel = `git.${duplicateCommit}.s${source.id}.r${source.revision}`;
  await f.store.tx(async () => {
    await f.store.insert('versions', {
      ...version,
      id: duplicateVersionId,
      version_label: duplicateLabel,
      origin_commit: duplicateCommit,
      intake_id: duplicateIntakeId,
      availability: 'unreleased',
    });
    const oldScan = await f.store.insert('scans', {
      ...scan,
      id: randomUUID(),
      version_id: duplicateVersionId,
      ruleset_version: 'previous-rules',
    });
    await f.store.insert('intakes', {
      ...record,
      id: duplicateIntakeId,
      version_id: duplicateVersionId,
      version_label: duplicateLabel,
      origin_commit: duplicateCommit,
      scan_run_id: oldScan.id,
      processing_ruleset: oldScan.ruleset_version,
      source_sync_job_id: undefined,
      source_generation: null,
    });
  });
  let latestRecheckId = '';

  for (const sha of ['a', 'b']) {
    context.mock.timers.tick(1000);
    commit = sha.repeat(40);
    const receipt = await syncedIntake(f, source.id);
    assert.notEqual(receipt.scan_run_id, original.scan_run_id);
    assert.equal(receipt.version_id, sha === 'a' ? original.version_id : duplicateVersionId);
    assert.equal(receipt.current_release_id, before.current_release_id);
    assert.equal(receipt.ruleset_current, true);
    assert.equal(receipt.publication, null);
    const ready = await f.hub.intakeQueries.list(f.admin, { state: 'ready' });
    assert(!ready.items.some(({ id }) => id === receipt.id));
    const unchanged = await f.hub.intakeQueries.list(f.admin, { state: 'unchanged' });
    assert(unchanged.items.some(({ id }) => id === receipt.id));
    assert.equal(receipt.matches_current_release, true);
    const manageable = (await f.hub.assetManagement.list(f.admin)).items[0];
    assert.equal(manageable.latest_intake?.state, 'unchanged');
    assert.deepEqual(manageable.latest_activity, before.latest_activity);
    assert.equal(manageable.needs_attention, false);
    assert.deepEqual(await f.hub.publicationQueries.listRequests(f.reviewer), []);
    latestRecheckId = receipt.id;
  }

  context.mock.timers.tick(1000);
  const requested = await f.hub.intakes.rescan(f.admin, latestRecheckId, randomUUID());
  await f.worker.tick();
  const rescan = await f.hub.intakeQueries.getDetail(f.admin, requested.intake_id);
  assert.equal(rescan.version_id, duplicateVersionId);
  assert.equal(rescan.matches_current_release, true);
  const manualActivity = (await f.hub.assetManagement.list(f.admin)).items[0];
  assert.equal(manualActivity.latest_intake?.state, 'unchanged');
  const lastSync = await f.store.get('intakes', latestRecheckId);
  assert(lastSync);
  await f.store.put('intakes', { ...lastSync, processing_ruleset: 'previous-rules' });
  context.mock.timers.tick(1000);
  const recheckedAfterRescan = await syncedIntake(f, source.id);
  assert.notEqual(recheckedAfterRescan.id, lastSync.id);
  assert.equal(recheckedAfterRescan.matches_current_release, true);
  assert.deepEqual(
    (await f.hub.assetManagement.list(f.admin)).items[0].latest_activity,
    manualActivity.latest_activity,
  );

  context.mock.timers.tick(1000);
  commit = 'c'.repeat(40);
  text = '新的内容';
  const changed = await syncedIntake(f, source.id);
  assert.notEqual(changed.version_id, original.version_id);
  assert.equal(changed.matches_current_release, false);
  assert.equal((await f.hub.assetManagement.list(f.admin, { state: 'needs_attention' })).total, 1);
  const changedRequest = await submitPublication(f, changed);
  await f.hub.publications.decide(
    f.reviewer,
    changedRequest.id,
    {
      decision: 'approve',
      comment: '核对有变更的新版本',
      policy_digest: changedRequest.policy_digest,
      accepted_warnings: [],
    },
    '"1"',
    randomUUID(),
  );
  assert.equal(
    (await f.hub.intakeQueries.getDetail(f.admin, latestRecheckId)).matches_current_release,
    false,
  );
  const approvals = await f.hub.intakeQueries.list(f.admin, { state: 'approved' });
  assert(approvals.items.some(({ id }) => id === original.id));

  context.mock.timers.tick(1000);
  await f.sources.patch(
    f.admin,
    source.id,
    {
      targets: [
        {
          binding_id: source.targets[0].id,
          slug,
          kind: 'skill',
          path: '.',
          category: 'uncategorized',
          scenario_ids: [],
          distribution: { mode: 'approved_audience', audience: ['organization'] },
        },
      ],
    },
    `"${source.revision}"`,
  );
  commit = 'd'.repeat(40);
  const newPolicy = await syncedIntake(f, source.id);
  assert.equal(newPolicy.version_id, changed.version_id);
  assert.equal(newPolicy.matches_current_release, false);
  const waiting = await f.hub.assetManagement.list(f.admin, { state: 'needs_attention' });
  assert.equal(waiting.items[0]?.latest_intake?.id, newPolicy.id);
  assert.equal(waiting.items[0].latest_intake?.state, 'ready');
});

test('Git 旧规则申请仅在成功重提时失效，并发重提只创建一份新申请', async (context) => {
  const f = await sources(context);
  const slug = 'recheck-pending';
  const source = await f.create(slug, '.');
  context.mock.method(f.hub.git, 'snapshot', async () => ({
    commit: 'a'.repeat(40),
    read: async () => [{ path: 'SKILL.md', bytes: skillDocument(slug), executable: false }],
    close: () => Promise.resolve(),
  }));
  const original = await syncedIntake(f, source.id);
  const sample = await submitPublication(f, original);
  await f.hub.publications.cancel(f.admin, sample.id, { reason: '准备旧规则快照' }, '"1"');
  const record = await f.store.get('intakes', original.id);
  const scan = await f.store.get('scans', original.scan_run_id);
  assert(record && scan);
  const ruleset_version = 'previous-rules';
  const oldScan = await f.store.insert('scans', { ...scan, id: randomUUID(), ruleset_version });
  await f.store.put('intakes', {
    ...record,
    scan_run_id: oldScan.id,
    processing_ruleset: ruleset_version,
  });
  const approval_policy_digest = digest(ruleset_version);
  const frozen = {
    ...(JSON.parse(sample.canonical_policy_json) as Record<string, unknown>),
    scan_run_id: oldScan.id,
    ruleset_version,
    approval_policy_digest,
  };
  const canonical_policy_json = canonical(frozen);
  const legacy = await f.store.insert('requests', {
    ...sample,
    id: randomUUID(),
    scan_run_id: oldScan.id,
    ruleset_version,
    approval_policy_digest,
    canonical_policy_json,
    policy_digest: digest(canonical_policy_json),
  });
  const refreshed = await syncedIntake(f, source.id);
  assert.equal(refreshed.version_id, original.version_id);
  assert.equal((await f.hub.publicationQueries.getReview(f.reviewer, legacy.id)).can_decide, false);
  await f.hub.administration.createScenario(f.admin, {
    name: '已登记场景',
    description: '已有用途',
  });
  const role = await f.hub.administration.createRole(f.admin, {
    name: '仅维护资源',
    permissions: ['asset:maintain'],
  });
  await f.hub.administration.grantRole(f.admin, {
    principal_id: f.reader.id,
    role_id: role.id,
    scope_type: 'asset',
    scope_id: refreshed.asset_id,
  });
  const admin = await f.hub.identity.principal(f.admin.id);
  const reader = await f.hub.identity.principal(f.reader.id);
  const authorized = { ...f, admin };
  await assert.rejects(() => submitPublication(authorized, original), code('SCAN_REQUIRED'));
  await assert.rejects(
    () => submitPublication({ ...f, admin: reader }, refreshed),
    code('FORBIDDEN'),
  );
  await assert.rejects(
    () =>
      f.hub.publications.submit(
        admin,
        {
          ...refreshed.proposed_policy,
          category: 'scenario',
          proposed_scenarios: [{ name: '已登记场景', description: '冲突用途' }],
          applies_to: {},
          purpose: '核对新用途',
          base_release_id: refreshed.current_release_id,
          source_intake_id: refreshed.id,
          version_id: refreshed.version_id,
        },
        randomUUID(),
      ),
    code('SCENARIO_CONFLICT'),
  );
  assert.deepEqual(await f.store.get('requests', legacy.id), legacy);
  assert(
    !(await f.store.where('audit', 'entity_id', legacy.id)).some(
      ({ action }) => action === 'publication.stale',
    ),
  );

  const attempts = await Promise.allSettled([
    submitPublication(authorized, refreshed),
    submitPublication(authorized, refreshed),
  ]);
  const accepted = attempts.filter((attempt) => attempt.status === 'fulfilled');
  const rejected = attempts.filter((attempt) => attempt.status === 'rejected');
  assert.equal(accepted.length, 1);
  assert.equal(rejected.length, 1);
  assert(code('PENDING_EXISTS')(rejected[0].reason));
  const replacement = accepted[0].value;
  assert.equal(replacement.scan_run_id, refreshed.scan_run_id);
  assert.equal(replacement.state, 'pending');
  const stale = await f.store.get('requests', legacy.id);
  assert.equal(stale?.state, 'stale');
  assert.equal(stale.stale_reason, 'SCAN_RULESET_CHANGED');
  assert.equal(stale.policy_digest, legacy.policy_digest);
  const events = await f.store.where('audit', 'entity_id', legacy.id);
  assert.deepEqual(
    events.filter(({ action }) => action === 'publication.stale').map(({ reason }) => reason),
    ['SCAN_RULESET_CHANGED'],
  );
  assert.deepEqual(
    (await f.hub.publicationQueries.listRequests(f.reviewer)).map(({ id }) => id),
    [replacement.id],
  );
});

test('仅有团队创建权限的用户收到来源回执，但不能独立读取配置', async (context) => {
  const f = await sources(context);
  const role = await f.hub.administration.createRole(f.admin, {
    name: '仅登记来源',
    permissions: ['source:create'],
  });
  await f.hub.administration.grantRole(f.admin, {
    principal_id: f.reader.id,
    role_id: role.id,
    scope_type: 'team',
    scope_id: f.teamId,
  });
  const creator = await f.hub.identity.principal(f.reader.id);
  const source = await f.sources.create(
    creator,
    {
      repository_url: 'https://127.0.0.1/team/create-only.git',
      provider: 'generic-git',
      branch: 'main',
      owner_group_id: f.teamId,
      targets: [
        {
          slug: 'create-only',
          kind: 'skill',
          path: '.',
          category: 'uncategorized',
          scenario_ids: [],
          distribution: { mode: 'approved_audience', audience: ['group:' + f.teamId] },
        },
      ],
    },
    randomUUID(),
  );
  assert.deepEqual(await f.sources.get(f.admin, source.id), source);
  await assert.rejects(() => f.sources.get(creator, source.id), code('FORBIDDEN'));
});

test('迁出最后一个目标保留来源封禁，历史撤销来源也不能作为迁入目标', async (context) => {
  const f = await sources(context);
  const old = await f.create('retired-origin', 'old');
  const destination = await f.create('new-origin', 'other');
  const assetId = old.targets[0].asset_id;
  await f.sources.revokeDistribution(f.admin, old.id, { reason: '来源撤销' }, '"1"');
  await f.hub.lifecycle.migrateSource(
    f.admin,
    assetId,
    {
      destination_source_id: destination.id,
      destination_source_revision: destination.revision,
      path: 'moved',
      reason: '迁出已封禁来源',
    },
    '"1"',
  );
  const revoked = (await f.store.get('sources', old.id))!;
  assert.equal(revoked.state, 'blocked');
  assert(revoked.distribution_revoked_at);
  await f.store.put('sources', { ...revoked, state: 'paused' });
  await assert.rejects(
    () =>
      f.hub.lifecycle.migrateSource(
        f.admin,
        assetId,
        {
          destination_source_id: old.id,
          destination_source_revision: revoked.revision,
          path: 'returned',
          reason: '尝试迁回',
        },
        '"2"',
      ),
    code('DESTINATION_SOURCE'),
  );
  assert.equal((await f.store.get('assets', assetId))?.source_id, destination.id);
});

test('Git 读取目标期间封禁会在扫描前拒绝，解封后同一固定提交可重新接收', async (context) => {
  const f = await sources(context);
  const source = await f.create('blocked-target', '.');
  const assetId = source.targets[0].asset_id;
  let blockOnRead = true;
  context.mock.method(f.hub.git, 'snapshot', async () => ({
    commit: 'a'.repeat(40),
    read: async () => {
      if (blockOnRead) {
        blockOnRead = false;
        await f.hub.lifecycle.updateState(
          f.admin,
          assetId,
          { lifecycle: 'blocked', reason: '调查' },
          '"1"',
        );
        return [];
      }
      return [{ path: 'SKILL.md', bytes: skillDocument('blocked-target'), executable: false }];
    },
    close: () => Promise.resolve(),
  }));
  const failed = await syncSource(f, source.id);
  assert.equal(failed.result?.targets[0].error_code, 'ASSET_BLOCKED');
  const [denied] = await f.store.where('intakes', 'asset_id', assetId);
  assert.deepEqual(
    denied.progress.map((step) => step.step),
    ['fetching'],
  );
  await f.hub.lifecycle.updateState(
    f.admin,
    assetId,
    { lifecycle: 'active', reason: '解封' },
    '"2"',
  );
  assert.equal((await syncSource(f, source.id)).result?.targets[0].state, 'ready');
});

test('连续轮询封禁目标只保留一次拒绝，不误用旧成功或阻碍同批解封目标', async (context) => {
  context.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-11-01T00:00:00Z') });
  const f = await sources(context);
  const source = await f.sources.create(
    f.admin,
    {
      repository_url: 'https://127.0.0.1/team/shared.git',
      provider: 'generic-git',
      branch: 'main',
      owner_group_id: f.teamId,
      targets: ['first-target', 'second-target'].map((slug) => ({
        slug,
        kind: 'skill',
        path: slug,
        category: 'uncategorized',
        scenario_ids: [],
        distribution: { mode: 'approved_audience', audience: ['group:' + f.teamId] },
      })),
    },
    randomUUID(),
  );
  const [first, second] = source.targets;
  const reads: string[] = [];
  context.mock.method(f.hub.git, 'snapshot', async () => ({
    commit: 'a'.repeat(40),
    read: async (path: string) => {
      reads.push(path);
      return [{ path: 'SKILL.md', bytes: skillDocument(path), executable: false }];
    },
    close: () => Promise.resolve(),
  }));
  await f.hub.lifecycle.updateState(
    f.admin,
    second.asset_id,
    { lifecycle: 'blocked', reason: '调查' },
    '"1"',
  );
  const initial = await syncSource(f, source.id);
  assert.equal(initial.result?.targets.find((t) => t.binding_id === first.id)?.state, 'ready');
  await f.hub.lifecycle.updateState(
    f.admin,
    first.asset_id,
    { lifecycle: 'blocked', reason: '调查' },
    '"1"',
  );
  await f.hub.lifecycle.updateState(
    f.admin,
    second.asset_id,
    { lifecycle: 'active', reason: '解封' },
    '"2"',
  );
  for (let i = 0; i < 3; i++) {
    context.mock.timers.tick(300_000);
    await f.worker.tick();
  }
  const polls = (await f.store.where('jobs', 'aggregate_id', source.id)).filter(
    (job) => job.kind === 'source_sync' && job.input.scheduled,
  );
  assert.equal(polls.length, 3);
  const denied = (await f.store.where('intakes', 'asset_id', first.asset_id)).filter(
    (intake) => intake.state === 'failed',
  );
  assert.equal(denied.length, 1);
  assert.equal(denied[0].error_code, 'ASSET_BLOCKED');
  for (const poll of polls) {
    const target = poll.result?.targets.find((t) => t.binding_id === first.id);
    assert.equal(target?.state, 'failed');
    assert.equal(target?.error_code, 'ASSET_BLOCKED');
    assert.equal(target?.intake_id, denied[0].id);
    assert.equal(poll.result?.targets.find((t) => t.binding_id === second.id)?.state, 'ready');
  }
  assert.deepEqual(reads, [first.path, second.path]);
});

test('Git 独立重扫不随来源同步取消，重试仍扫描原提交复用的固定版本', async (context) => {
  const f = await sources(context);
  const source = await f.create('fixed-rescan', '.');
  let commit = 'a'.repeat(40);
  context.mock.method(f.hub.git, 'snapshot', async () => ({
    commit,
    read: async () => [
      { path: 'SKILL.md', bytes: skillDocument('fixed-rescan'), executable: false },
    ],
    close: () => Promise.resolve(),
  }));
  const versionId = (await syncSource(f, source.id)).result?.targets[0].version_id;
  assert(versionId);
  commit = 'b'.repeat(40);
  const later = await syncSource(f, source.id);
  const target = later.result?.targets[0];
  assert(target && target.version_id === versionId);
  const rescan = await f.hub.intakes.rescan(f.admin, target.intake_id, randomUUID());
  const pending = (await f.store.get('intakes', rescan.intake_id))!;
  assert.equal(pending.source_sync_job_id, undefined);
  const job = (await f.store.get('jobs', rescan.job_id))!;
  await f.store.put('jobs', { ...job, run_after: Date.now() + 60000 });
  // 旧数据可能同时记录了旧同步作业和独立重扫作业。
  await f.store.put('intakes', { ...pending, source_sync_job_id: later.id });
  await syncSource(f, source.id);
  assert.equal((await f.store.get('intakes', pending.id))?.state, 'received');
  await f.store.put('jobs', { ...job, attempt: 2 });
  const outage = context.mock.method(f.blobs, 'read', async () => {
    throw new HubError(503, 'BLOB_MISSING', '暂时无法读取', {}, true);
  });
  await f.worker.tick();
  assert.equal((await f.store.get('intakes', pending.id))?.state, 'failed');
  outage.mock.restore();
  const receipt = await f.hub.intakes.retry(f.admin, pending.id);
  const retry = await f.store.get('jobs', receipt.job_id);
  assert(retry?.kind === 'rescan');
  assert.equal(retry.input.version_id, versionId);
  await f.worker.tick();
  const result = await f.store.get('intakes', pending.id);
  assert.equal(result?.state, 'ready');
  assert.equal(result.version_id, versionId);
  assert.equal((await f.store.all('versions')).length, 1);
});

test('Git 命令超时会关闭仍持有连接的 SSH helper', { timeout: 10000 }, async (context) => {
  let connection: Socket | undefined;
  const connected = deferred();
  const closed = deferred();
  const server = createServer((socket) => {
    connection = socket;
    socket.once('close', () => closed.resolve());
    socket.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code !== 'ECONNRESET') closed.reject(error);
    });
    socket.resume();
    connected.resolve();
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  context.after(() => {
    connection?.destroy();
    server.close();
  });
  const address = server.address();
  assert(address && typeof address !== 'string');
  const git = new GitRepositoryAdapter(
    { dataDir: tmpdir(), gitHosts: ['127.0.0.1'], privateGitHosts: ['127.0.0.1'] },
    {
      resolve: async () => ({
        kind: 'ssh',
        username: 'git',
        auth_method: 'basic',
        secret: 'fixture',
        passphrase: '',
        host_key: 'fixture',
        revision: 1,
      }),
      currentRevision: async () => 1,
    },
  );
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const timeout = assert.rejects(
    git.snapshot({
      canonical_url: `ssh://git@127.0.0.1:${address.port}/fixture.git`,
      branch: 'main',
      credential_ref: 'fixture',
    }),
    code('GIT_TIMEOUT'),
  );
  await Promise.race([connected.promise, timeout]);
  context.mock.timers.tick(45000);
  await Promise.all([timeout, closed.promise]);
});
