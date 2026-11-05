import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { randomUUID } from 'node:crypto';
import { SourceSyncService } from '@capability-hub/application';
import type { GitRepository } from '@capability-hub/application/ports';
import { HubError } from '@capability-hub/domain/errors';
import { archive } from '@capability-hub/infrastructure/content';
import { createTestHub, publishSkill, testPassword } from '../support/application.js';
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

async function syncSource(fixture: Awaited<ReturnType<typeof sources>>, sourceId: string) {
  const { job_id } = await fixture.sources.sync(fixture.admin, sourceId, randomUUID());
  await fixture.worker.tick();
  const job = await fixture.store.get('jobs', job_id);
  assert(job?.kind === 'source_sync');
  return job;
}

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
