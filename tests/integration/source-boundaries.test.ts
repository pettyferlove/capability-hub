import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { randomUUID } from 'node:crypto';
import { SourceSyncService } from '@capability-hub/application';
import type { GitRepository } from '@capability-hub/application/ports';
import { HubError } from '@capability-hub/domain/errors';
import { archive } from '@capability-hub/infrastructure/content';
import { createTestHub, publishSkill, testPassword } from '../support/application.js';
import { skillDocument } from '../support/content.js';

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
  async function create(slug: string, path: string) {
    return fixture.sources.create(
      fixture.admin,
      {
        repository_url: `https://127.0.0.1/team/${slug}.git`,
        provider: 'generic-git',
        branch: 'main',
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
