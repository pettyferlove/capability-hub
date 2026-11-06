import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { openRecordStore, snapshotStore, restoreStore } from '@capability-hub/infrastructure/store';
import { MinioBlobStore } from '@capability-hub/infrastructure/content';
import { HubError } from '@capability-hub/domain/errors';
import type { PublicationRequestRecord } from '@capability-hub/domain/models';
import type { OperationsResponse } from '@capability-hub/contracts/http';
import { createTestHub, publishSkill, receiveSkill } from '../support/application.js';
import { frameworkConfig } from '../support/ai-framework.js';
import { signIn } from '../support/http.js';
import { externalDatabase, externalBucket } from '../support/external.js';
import { createSqliteStore, deferred } from '../support/store.js';
import { assertFrozenEvidence } from '../support/evidence.js';
import { assertProjectTokenUsage } from '../support/token-usage.js';
import { assertResourceActivity } from '../support/resource-activity.js';

test('PostgreSQL 维护列表按业务事件更新顺序，读取操作不覆盖最近变动', async (context) => {
  const database = await externalDatabase();
  try {
    context.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-11-01T00:00:00Z') });
    const f = await createTestHub(context, {
      database: { driver: 'postgresql', url: database.url, poolSize: 2 },
    });
    try {
      const first = await publishSkill(f, { slug: 'older-skill' });
      context.mock.timers.tick(1000);
      const second = await receiveSkill(f, { slug: 'newer-skill' });
      assert.equal((await f.hub.assetManagement.list(f.admin)).items[0].id, second.asset_id);
      context.mock.timers.tick(1000);
      const asset = await f.hub.assetAccess.getAsset(first.intake.asset_id);
      await f.hub.lifecycle.updateState(
        f.admin,
        asset.id,
        {
          lifecycle: 'blocked',
          reason: '暂停分发',
        },
        `"${asset.revision}"`,
      );
      const expected = { occurred_at: new Date().toISOString(), label: '封禁资产' };
      context.mock.timers.tick(1000);
      await f.hub.assetManagement.versions(f.admin, asset.id);
      const listed = await f.hub.assetManagement.list(f.admin);
      assert.equal(listed.items[0].id, asset.id);
      assert.deepEqual(listed.items[0].latest_activity, expected);
      assert.equal(listed.items[0].needs_attention, false);
      assert.equal(listed.items[1].needs_attention, true);
    } finally {
      await f.close();
    }
  } finally {
    await database.close();
  }
});

test('PostgreSQL 和 SQLite 使用相同的资源运营趋势口径', async (context) => {
  const database = await externalDatabase();
  try {
    const f = await createTestHub(context, {
      database: { driver: 'postgresql', url: database.url, poolSize: 2 },
    });
    try {
      await assertResourceActivity(context, f);
    } finally {
      await f.close();
    }
  } finally {
    await database.close();
  }
});

test('PostgreSQL 的项目 Token 总量、时间边界和分布与 SQLite 一致', async (context) => {
  const database = await externalDatabase();
  try {
    context.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-11-02T06:30:00.000Z') });
    const f = await createTestHub(context, {
      ai: frameworkConfig(),
      database: { driver: 'postgresql', url: database.url, poolSize: 2 },
    });
    try {
      await assertProjectTokenUsage(f);
    } finally {
      await f.close();
    }
  } finally {
    await database.close();
  }
});

test('PostgreSQL 上两个连接争抢同一约束只有一个成功，失败事务全部回滚并允许后续使用', async () => {
  const database = await externalDatabase();
  const poolErrors: Error[] = [];
  const onPoolError = (error: Error) => {
    poolErrors.push(error);
  };
  const first = await openRecordStore({ driver: 'postgresql', url: database.url, onPoolError });
  const second = await openRecordStore({ driver: 'postgresql', url: database.url, onPoolError });
  try {
    const name = '唯一团队';
    const results = await Promise.allSettled(
      [first, second].map((store) =>
        store.insert('groups', { id: randomUUID(), revision: 1, active: true, name }),
      ),
    );
    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
    await assert.rejects(() =>
      first.tx(async () => {
        await first.insert('groups', {
          id: randomUUID(),
          revision: 1,
          active: true,
          name: '不应提交',
        });
        await first.insert('groups', { id: randomUUID(), revision: 1, active: true, name });
      }),
    );
    assert.deepEqual(
      (await second.all('groups')).map((group) => group.name),
      [name],
    );
    const entered = deferred();
    const release = deferred();
    const holding = first.tx(async () => {
      entered.resolve();
      await release.promise;
      await first.insert('groups', { id: randomUUID(), revision: 1, active: true, name: '先提交' });
    });
    await entered.promise;
    let completed = false;
    const waiting = second.tx(async () => {
      completed = true;
      assert(await second.find('groups', 'name', '先提交'));
    });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(completed, false);
    release.resolve();
    await Promise.all([holding, waiting]);
    assert.deepEqual(poolErrors, []);
  } finally {
    await Promise.all([first.close(), second.close()]);
    await database.close();
  }
});

test('MinIO 使用受限应用账号写入与复读校验，匿名不能读取，损坏对象不会被同名写入修复', async () => {
  const resource = await externalBucket();
  const blobs = new MinioBlobStore(resource.options, resource.bucket);
  try {
    await blobs.health();
    const bytes = Buffer.from('固定内容\0\xff');
    const hash = await blobs.put(bytes);
    assert.equal(await blobs.put(bytes), hash);
    assert.deepEqual(await blobs.read(hash), bytes);
    const response = await fetch(`${resource.endpoint}/${resource.bucket}/blobs/${hash}`);
    assert.equal(response.status, 403);
    await response.body?.cancel();
    await resource.admin.putObject(resource.bucket, 'blobs/' + hash, Buffer.from('corrupt'));
    await assert.rejects(
      () => blobs.read(hash),
      (error: unknown) => error instanceof HubError && error.code === 'BLOB_CORRUPT',
    );
    await assert.rejects(
      () => blobs.put(bytes),
      (error: unknown) => error instanceof HubError && error.code === 'BLOB_CORRUPT',
    );
    assert.equal(await blobs.exists(hash), false);
    await blobs.remove(hash);
    assert.equal(await blobs.exists(hash), false);
  } finally {
    await blobs.close();
    await resource.close();
  }
});

test('PostgreSQL 并发审批冻结的同名场景定义只登记一个共享 ID', async (context) => {
  const database = await externalDatabase();
  const f = await createTestHub(context, {
    database: { driver: 'postgresql', url: database.url, poolSize: 4 },
  });
  try {
    const definition = { name: '依赖审查', description: '确认依赖升级范围。' };
    const requests: PublicationRequestRecord[] = [];
    for (const slug of ['review-dependencies', 'review-upgrades']) {
      const intake = await receiveSkill(f, { slug });
      requests.push(
        await f.hub.publications.submit(
          f.admin,
          {
            source_intake_id: intake.id,
            version_id: intake.version_id,
            category: 'scenario',
            scenario_ids: [],
            proposed_scenarios: [definition],
            distribution: intake.proposed_policy.distribution,
            applies_to: {},
            purpose: '审查依赖升级',
            base_release_id: null,
          },
          randomUUID(),
        ),
      );
    }
    await assert.rejects(
      () =>
        f.store.put('requests', {
          ...requests[0],
          proposed_scenarios: [{ ...definition, description: '其他用途' }],
        }),
      /immutable/,
    );
    assert.deepEqual(await f.hub.catalog.listScenarios(f.admin), []);
    await Promise.all(
      requests.map((r) =>
        f.hub.publications.decide(
          f.reviewer,
          r.id,
          {
            decision: 'approve',
            policy_digest: r.policy_digest,
            comment: '',
            accepted_warnings: [],
          },
          '"1"',
          randomUUID(),
        ),
      ),
    );
    const scenarios = await f.store.all('scenarios');
    assert.equal(scenarios.length, 1);
    const releases = await f.store.all('releases');
    assert.equal(releases.length, 2);
    for (const r of releases) assert.deepEqual(r.scenario_ids, [scenarios[0].id]);
  } finally {
    await f.close();
    await database.close();
  }
});

test('真实 PostgreSQL 与 MinIO 完成扫描、独立审核、分发与撤权；快照可在 SQLite 重放一致记录', async (context) => {
  const database = await externalDatabase();
  const resource = await externalBucket();
  const fixture = await createTestHub(context, {
    database: { driver: 'postgresql', url: database.url, poolSize: 4 },
    objectStorage: {
      driver: 'minio',
      endpoint: resource.endpoint,
      accessKey: resource.options.accessKey,
      secretKey: resource.options.secretKey,
      bucket: resource.bucket,
      region: 'us-east-1',
      prefix: 'blobs/',
    },
  });
  try {
    const { intake } = await publishSkill(fixture);
    const release = await fixture.store.find('requests', 'source_intake_id', intake.id);
    assert(release);
    await assertFrozenEvidence(fixture.store, intake.scan_run_id, release.id);
    await assert.rejects(
      () => fixture.store.put('requests', { ...release, decision_reason: '改写审核决定' }),
      /immutable/,
    );
    const catalog = await fixture.hub.catalog.search(null, {});
    assert.equal(catalog.total, 1);
    const version = await fixture.store.get('versions', intake.version_id);
    assert(version);
    const reordered = Object.fromEntries(Object.entries(version).reverse()) as typeof version;
    await fixture.store.put('versions', reordered);
    await assert.rejects(() =>
      fixture.store.put('versions', {
        ...version,
        metadata: { ...version.metadata, description: '错误修改' },
      }),
    );
    assert(
      (await fixture.hub.content.getFile(null, version.id, 'SKILL.md')).bytes
        .toString()
        .includes('sample-skill'),
    );
    const feedbackInput = {
      version_id: version.id,
      idempotency_key: randomUUID(),
      consent: true as const,
      kind: 'capability_gap' as const,
      title: '补充批处理',
      scenario: '多条数据处理',
      expected: '一次处理多条记录',
      actual: '只能单条执行',
      location: '',
      reproduction: '',
      evidence: '',
      suggestion: '',
      blocking: false,
    };
    const [feedback, retry] = await Promise.all([
      fixture.hub.feedback.report(fixture.reader, feedbackInput),
      fixture.hub.feedback.report(fixture.reader, feedbackInput),
    ]);
    assert.equal(feedback.id, retry.id);
    assert.equal((await fixture.store.all('asset_feedback')).length, 1);
    await fixture.hub.feedback.update(fixture.admin, feedback.id, {
      revision: 1,
      status: 'in_progress',
      resolution: '已安排实现',
      fixed_version_id: null,
    });
    assert.equal(
      (await fixture.hub.feedback.get(fixture.reader, feedback.id)).status,
      'in_progress',
    );
    const snapshot = await snapshotStore(fixture.store);
    const { store: sqlite } = await createSqliteStore(context);
    await restoreStore(sqlite, snapshot);
    assert.deepEqual(await snapshotStore(sqlite), snapshot);
    await fixture.hub.sources.revokeDistribution(
      fixture.admin,
      intake.source_id,
      { reason: '停止共享' },
      '"1"',
    );
    await assert.rejects(() => fixture.hub.content.getManifest(null, version.id));
  } finally {
    await fixture.close();
    await resource.close();
    await database.close();
  }
});

test('运维接口从 PostgreSQL 汇总执行与容量，从受限 MinIO 存储桶探测读写', async (context) => {
  const database = await externalDatabase();
  const resource = await externalBucket();
  const fixture = await createTestHub(context, {
    ai: frameworkConfig(),
    database: { driver: 'postgresql', url: database.url, poolSize: 4 },
    objectStorage: {
      driver: 'minio',
      endpoint: resource.endpoint,
      accessKey: resource.options.accessKey,
      secretKey: resource.options.secretKey,
      bucket: resource.bucket,
      region: 'us-east-1',
      prefix: 'blobs/',
    },
  });
  try {
    const execution = await fixture.hub.ai.runtime.submit(fixture.admin.id, 'assistant', {
      prompt: '测试任务',
    });
    const admin = await signIn(fixture);
    const response = await admin.get('/api/admin/operations').expect(200);
    const data = response.body as OperationsResponse;
    assert.equal(data.database.driver, 'postgresql');
    assert.equal(data.database.available, true);
    assert(data.database.size_bytes && data.database.size_bytes > 0);
    assert.equal(data.database.pool_limit, 4);
    assert.equal(data.object_storage.driver, 'minio');
    assert.equal(data.object_storage.available, true);
    assert.equal(data.object_storage.bucket, resource.bucket);
    assert.equal(data.object_storage.prefix, 'blobs/');
    assert.deepEqual(data.agents.operations.find((agent) => agent.id === 'assistant')?.activity, {
      by_status: { queued: 1 },
      last_activity_at: execution.updated_at,
    });
    assert.deepEqual(
      data.agents.daily_activity?.flatMap((day) => day.counts),
      [{ operation_id: 'assistant', status: 'queued', count: 1, error_code: null }],
    );
    const id = randomUUID();
    const createdAt = '2025-01-02T16:00:00.000Z';
    await fixture.hub.ai.runtime.store.insert('ai_executions', {
      ...execution,
      id,
      execution_id: id,
      created_at: createdAt,
      position: Date.parse(createdAt),
      status: 'failed',
      payload: {
        ...execution.payload,
        error: { code: 'AI_PROVIDER_FAILED', message: 'private', retryable: false },
      },
    });
    assert.deepEqual(
      await fixture.hub.ai.runtime.store.summarizeExecutionDays(
        '2025-01-01T16:00:00.000Z',
        createdAt,
      ),
      [
        {
          day_index: 1,
          operation_id: 'assistant',
          status: 'failed',
          error_code: 'AI_PROVIDER_FAILED',
          count: 1,
        },
      ],
    );
    for (const value of [
      database.url,
      resource.endpoint,
      resource.options.accessKey,
      resource.options.secretKey,
    ])
      assert(!response.text.includes(value));
  } finally {
    await fixture.close();
    await resource.close();
    await database.close();
  }
});
