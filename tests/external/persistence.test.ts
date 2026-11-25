import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { aiConfigurationSchema, ShortModelError } from '@capability-hub/ai';
import { aiExecutionDiagnosticsResponseSchema } from '@capability-hub/contracts';
import { z } from 'zod';
import { sha256 } from '@capability-hub/domain/canonical';
import { openRecordStore, snapshotStore, restoreStore } from '@capability-hub/infrastructure/store';
import { JobQueue } from '@capability-hub/application';
import { MinioBlobStore } from '@capability-hub/infrastructure/content';
import { purgeAiExchanges } from '@capability-hub/infrastructure/ai';
import { HubError } from '@capability-hub/domain/errors';
import type {
  GitSourceRecord,
  JobRecord,
  PublicationRequestRecord,
} from '@capability-hub/domain/models';
import type { HubFeedbackDetailResponse, OperationsResponse } from '@capability-hub/contracts/http';
import { createTestHub, publishSkill, receiveSkill } from '../support/application.js';
import { frameworkConfig } from '../support/ai-framework.js';
import { signIn } from '../support/http.js';
import { externalDatabase, externalBucket } from '../support/external.js';
import { createSqliteStore, deferred } from '../support/store.js';
import { assertFrozenEvidence } from '../support/evidence.js';
import { assertProjectTokenUsage } from '../support/token-usage.js';
import { assertResourceActivity } from '../support/resource-activity.js';
import { assertScenarioDeletionReferences } from '../support/scenario-deletion.js';
import { assertSingleInstallRedemption } from '../support/install-tickets.js';
import { serveTestHub } from '../support/server.js';
import { openAiJson, serveModelStub } from '../support/model-provider-stub.js';

test('PostgreSQL 通过评测生成列调度，同一空摘要仅允许一条在途评测', async (context) => {
  const database = await externalDatabase();
  try {
    const f = await createTestHub(context, {
      database: { driver: 'postgresql', url: database.url, poolSize: 2 },
    });
    const sql = new Client({ connectionString: database.url });
    try {
      await sql.connect();
      const intake = await receiveSkill(f);
      const [original] = await f.store.listVersionEvaluations(intake.version_id);
      const revision = await f.store.revision();
      const urgent = await f.store.insert('resource_evaluations', {
        ...original,
        id: randomUUID(),
        priority: 100,
        scope: 'full',
        trigger: 'submission',
        audience_class: 'signed_in',
        requires_api_key: false,
        evaluator_digest: 'sha256:' + sha256('model'),
        subject_digest: 'sha256:' + sha256('subject'),
      });
      const { rows } = await sql.query(
        'SELECT asset_id, version_id, state, priority, requested_at, rubric_version, subject_digest, evaluator_digest FROM resource_evaluations WHERE id = $1',
        [original.id],
      );
      assert.deepEqual(rows[0], {
        asset_id: intake.asset_id,
        version_id: intake.version_id,
        state: 'queued',
        priority: 0,
        requested_at: original.requested_at,
        rubric_version: original.rubric_version,
        subject_digest: original.subject_digest,
        evaluator_digest: null,
      });
      assert.deepEqual(
        (await f.store.listQueuedEvaluations(1)).map((row) => row.id),
        [urgent.id],
      );
      const duplicateId = randomUUID();
      await assert.rejects(
        sql.query('INSERT INTO resource_evaluations(id,data) VALUES ($1,$2)', [
          duplicateId,
          { ...original, id: duplicateId },
        ]),
        { code: '23505' },
      );
      await f.store.put('resource_evaluations', { ...original, state: 'failed' });
      await assert.rejects(
        sql.query('UPDATE resource_evaluations SET data = data WHERE id = $1', [original.id]),
        { code: '23514' },
      );
      const replacement = await f.store.insert('resource_evaluations', {
        ...original,
        id: randomUUID(),
      });
      assert.deepEqual(
        (await f.store.listQueuedEvaluations(10)).map((row) => row.id),
        [urgent.id, replacement.id],
      );
      assert.deepEqual(
        (await f.store.listQueuedEvaluations(1, [], urgent)).map((row) => row.id),
        [replacement.id],
      );
      const id = randomUUID();
      await assert.rejects(
        sql.query('INSERT INTO resource_evaluations(id,data) VALUES ($1,$2)', [
          id,
          { ...original, id, version_id: randomUUID() },
        ]),
        { code: '23503' },
      );
      await f.store.insert('evaluation_schedule', {
        id: 'resource-evaluations',
        window_start: Date.now(),
        reserved: 0,
        updated_at: new Date().toISOString(),
      });
      assert.equal(await f.store.revision(), revision);
    } finally {
      await sql.end();
      await f.close();
    }
  } finally {
    await database.close();
  }
});

test('PostgreSQL 按近期使用量选当前发布回填，手动次数限定为目标资产', async (context) => {
  const database = await externalDatabase();
  try {
    const f = await createTestHub(context, {
      database: { driver: 'postgresql', url: database.url, poolSize: 2 },
    });
    try {
      const first = await publishSkill(f, { slug: 'first-skill' });
      const second = await publishSkill(f, { slug: 'second-skill' });
      await f.store.audit(f.admin.id, 'skill.loaded', second.intake.version_id);
      const since = new Date(Date.now() - 86400000).toISOString();
      const asset = await f.hub.assetAccess.getAsset(second.intake.asset_id);
      assert.equal(
        await f.store.nextEvaluationBackfill('new-rubric', 'sha256:' + 'a'.repeat(64), since),
        asset.current_release_id,
      );
      await f.hub.evaluations.manual(f.admin, second.intake.version_id, randomUUID());
      assert.equal(await f.store.countManualEvaluations(first.intake.asset_id, since), 0);
      assert.equal(await f.store.countManualEvaluations(second.intake.asset_id, since), 1);
    } finally {
      await f.close();
    }
  } finally {
    await database.close();
  }
});

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

test('PostgreSQL 诊断与导出不解码无权查看的往返正文，交接只附相关调用', async (t) => {
  const stub = await serveModelStub(t);
  const profile = stub.profile('openai');
  const database = await externalDatabase();
  try {
    const f = await createTestHub(t, {
      database: { driver: 'postgresql', url: database.url, poolSize: 2 },
      ai: aiConfigurationSchema.parse({ profiles: [profile], default_profile: profile.id }),
    });
    const sql = new Client({ connectionString: database.url });
    try {
      const runtime = f.hub.ai.runtime;
      const options = {
        operationId: 'resource-evaluation',
        ownerId: 'system',
        profileId: profile.id,
        signal: new AbortController().signal,
      };
      const input = {
        operation: 'resource-evaluation/check',
        instructions: 'Return JSON.',
        schema: z.strictObject({}),
      };
      await assert.rejects(
        runtime.runInline(options, async (run) => {
          await run.call('accepted', { ...input, input: 'accepted-only-marker' });
          await run.call('restricted', {
            ...input,
            input: 'restricted-marker',
            resources: [randomUUID()],
          });
          await run.call('rejected', {
            ...input,
            input: 'rejected-marker',
            schema: z.strictObject({ decision: z.boolean() }),
          });
        }),
        ShortModelError,
      );
      const [record] = await runtime.store.list('ai_executions', {
        lookup_key: options.operationId,
        limit: 1,
      });
      const path = '/api/admin/operations/agents/executions/' + record.id;
      const calls = await runtime.store.list('ai_calls', { execution_id: record.id, limit: 3 });
      // 模拟不可解码的历史正文：仅检查引用版本时不应解析它，无权查看时也不能阻断其他调用的导出。
      await sql.connect();
      await sql.query(
        "UPDATE ai_exchanges SET data = jsonb_set(data, '{payload,response,text}', 'null') WHERE id = $1",
        [calls[1].id],
      );
      const client = await signIn(f);
      const snapshot = await client.get(path + '/diagnostics').expect(200);
      const report = aiExecutionDiagnosticsResponseSchema.parse(snapshot.body);
      assert.deepEqual(
        report.model_calls.map((call) => call.exchange),
        ['available', 'withheld', 'available'],
      );
      assert.doesNotMatch(snapshot.text, /accepted-only-marker|restricted-marker|rejected-marker/);
      await client.get(`${path}/calls/${calls[1].id}/exchange`).expect(403);
      const download = await client.get(path + '/diagnostics?download=json').expect(200);
      assert.deepEqual(
        aiExecutionDiagnosticsResponseSchema
          .parse(download.body)
          .exchanges?.map((entry) => entry.call_id)
          .sort(),
        [calls[0].id, calls[2].id].sort(),
      );
      const handoff = await client.get(path + '/diagnostics?download=markdown').expect(200);
      assert.match(handoff.text, /rejected-marker/);
      assert.doesNotMatch(handoff.text, /accepted-only-marker|restricted-marker/);
      assert.equal(await purgeAiExchanges(f.store, 0, 0), 3);
      assert.deepEqual(await runtime.store.listExchangeRefs(record.id), []);
    } finally {
      await sql.end();
      await f.close();
    }
  } finally {
    await database.close();
  }
});

test('PostgreSQL 无损保留特殊字符，原文写入被拒也结算已返回的模型用量', async (t) => {
  const reasoning = '证\0据\ud800😀\\u0000';
  const stub = await serveModelStub(t, () => {
    const reply = openAiJson({});
    Object.assign(reply.choices[0].message, { reasoning_content: reasoning });
    return { json: reply };
  });
  const profile = stub.profile('openai');
  const database = await externalDatabase();
  try {
    const f = await createTestHub(t, {
      database: { driver: 'postgresql', url: database.url, poolSize: 2 },
      ai: aiConfigurationSchema.parse({ profiles: [profile], default_profile: profile.id }),
    });
    const sql = new Client({ connectionString: database.url });
    try {
      await sql.connect();
      const runtime = f.hub.ai.runtime;
      const options = {
        operationId: 'resource-evaluation',
        ownerId: 'system',
        profileId: profile.id,
        signal: new AbortController().signal,
      };
      const request = {
        operation: 'resource-evaluation/check',
        instructions: '返回空对象',
        input: reasoning,
        schema: z.strictObject({}),
      };
      await runtime.runInline(options, async (run) => {
        await run.call('retained', request);
        await sql.query('ALTER TABLE ai_exchanges ADD CHECK (false) NOT VALID');
        await run.call('unavailable', request);
      });
      const [execution] = await runtime.store.list('ai_executions', {
        lookup_key: options.operationId,
        limit: 1,
      });
      assert.equal(execution.status, 'succeeded');
      assert.deepEqual(execution.payload.usage, {
        requests: 2,
        tools: 0,
        input_tokens: 22,
        output_tokens: 14,
        unknown_requests: 0,
      });
      const query = { execution_id: execution.id, limit: 10 };
      const calls = await runtime.store.list('ai_calls', query);
      assert.deepEqual(
        calls.map((call) => [call.status, call.payload.input_tokens, call.payload.output_tokens]),
        [
          ['succeeded', 11, 7],
          ['succeeded', 11, 7],
        ],
      );
      const exchanges = await runtime.store.list('ai_exchanges', query);
      assert.equal(exchanges.length, 1);
      const [kept] = exchanges;
      assert.equal(kept.id, calls[0].id);
      assert.equal(kept.payload.response?.reasoning, reasoning);
      assert.deepEqual(kept.payload.request.body, stub.requests[0].body);
      assert.deepEqual(
        await runtime.store.listExchangeRefs(execution.id, kept.id, kept.position),
        [],
      );
      assert.deepEqual(
        (await runtime.store.listExchangeRefs(execution.id, undefined, kept.position - 1)).map(
          (row) => row.id,
        ),
        [kept.id],
      );
      assert.equal(await purgeAiExchanges(f.store, 1, kept.position + 86_400_000), 1);
    } finally {
      await sql.end();
      await f.close();
    }
  } finally {
    await database.close();
  }
});

test('PostgreSQL 禁止删除仍被引用或参与合并的场景', async (context) => {
  const database = await externalDatabase();
  try {
    const f = await createTestHub(context, {
      database: { driver: 'postgresql', url: database.url, poolSize: 2 },
      gitHosts: ['127.0.0.1'],
      privateGitHosts: ['127.0.0.1'],
    });
    try {
      await assertScenarioDeletionReferences(f);
    } finally {
      await f.close();
    }
  } finally {
    await database.close();
  }
});

test('PostgreSQL 并发兑换安装票据只交付一次，兑换后仍可读清单', async (context) => {
  const database = await externalDatabase();
  try {
    const fixture = await serveTestHub(context, {
      database: { driver: 'postgresql', url: database.url, poolSize: 2 },
    });
    try {
      await assertSingleInstallRedemption(fixture);
    } finally {
      await fixture.close();
    }
  } finally {
    await database.close();
  }
});

test('PostgreSQL 调度查询按数值时间、状态和取消标记筛选并稳定限量', async () => {
  const database = await externalDatabase();
  const poolErrors: Error[] = [];
  const onPoolError = (error: Error) => {
    poolErrors.push(error);
  };
  try {
    const store = await openRecordStore({ driver: 'postgresql', url: database.url, onPoolError });
    try {
      const timestamp = Date.parse('2026-11-03T00:00:00Z');
      const base = {
        kind: 'intake' as const,
        aggregate_id: randomUUID(),
        input: {},
        state: 'queued' as const,
        attempt: 0,
        run_after: 10,
        lease_epoch: 0,
        lease_until: 0,
        cancel_requested: false,
        created_at: new Date(timestamp).toISOString(),
      };
      const jobs: JobRecord[] = [
        { ...base, id: 'ready-b' },
        { ...base, id: 'ready-a' },
        { ...base, id: 'earliest', run_after: 9 },
        { ...base, id: 'boundary', run_after: timestamp },
        { ...base, id: 'future', run_after: timestamp + 1 },
        {
          ...base,
          id: 'expired',
          state: 'running',
          run_after: timestamp + 2,
          lease_until: timestamp,
        },
        { ...base, id: 'live', state: 'running', lease_until: timestamp + 1 },
        { ...base, id: 'cancel-queued', cancel_requested: true },
        {
          ...base,
          id: 'cancel-running',
          state: 'running',
          cancel_requested: true,
          lease_until: timestamp + 1,
        },
        ...(['succeeded', 'failed', 'cancelled'] as const).map((state) => ({
          ...base,
          id: state,
          state,
          cancel_requested: true,
        })),
        { ...base, id: 'ai', kind: 'ai_execution', input: { execution_id: randomUUID() } },
      ];
      for (const job of jobs) await store.insert('jobs', job);
      assert.deepEqual(
        (await store.listAiExecutionJobs(base.aggregate_id)).map((job) => job.id),
        ['ai'],
      );
      assert.deepEqual(await store.listRunningJobIds(timestamp), ['cancel-running', 'live']);
      const query = { now: timestamp, limit: 20, excludeIds: [] };
      assert.deepEqual(
        (await store.listReadyJobs(query)).map((job) => job.id),
        ['earliest', 'ai', 'ready-a', 'ready-b', 'boundary', 'expired'],
      );
      assert.deepEqual(
        (
          await store.listReadyJobs({
            ...query,
            kinds: ['intake'],
            excludeIds: ['earliest'],
            limit: 2,
          })
        ).map((job) => job.id),
        ['ready-a', 'ready-b'],
      );
      assert.deepEqual(await store.listReadyJobs({ ...query, kinds: [] }), []);
      assert.deepEqual(
        (await store.listCancellationRequestedJobs()).map((job) => job.id),
        ['cancel-queued', 'cancel-running'],
      );
      const group = await store.insert('groups', {
        id: randomUUID(),
        revision: 1,
        active: true,
        name: '调度来源',
      });
      const source: GitSourceRecord = {
        id: 'due-b',
        revision: 1,
        kind: 'git',
        owner_group_id: group.id,
        state: 'active',
        generation: 1,
        created_at: base.created_at,
        provider: 'git',
        canonical_url: 'https://example.com/repo.git',
        repository_identity: 'example.com/repo',
        branch: 'main',
        credential_ref: null,
        next_poll_at: timestamp,
      };
      for (const record of [
        source,
        { ...source, id: 'due-a', next_poll_at: 9 },
        { ...source, id: 'future-source', next_poll_at: timestamp + 1 },
        { ...source, id: 'paused-source', state: 'paused' as const },
        { ...source, id: 'blocked-source', state: 'blocked' as const },
        { ...source, id: 'auth-source', state: 'auth_error' as const },
        { ...source, id: 'revoked-source', distribution_revoked_at: base.created_at },
      ])
        await store.insert('sources', record);
      await store.insert('sources', {
        id: 'upload-source',
        revision: 1,
        kind: 'upload',
        owner_group_id: group.id,
        state: 'active',
        generation: 1,
        created_at: base.created_at,
      });
      assert.deepEqual(
        (await store.listDueSources(timestamp)).map((record) => record.id),
        ['due-a', 'due-b'],
      );
    } finally {
      await store.close();
    }
    assert.deepEqual(poolErrors, []);
  } finally {
    await database.close();
  }
});

test('PostgreSQL 两连接争最后一个共享名额且取消事务保留有效租约', async () => {
  const database = await externalDatabase();
  const poolErrors: Error[] = [];
  const onPoolError = (error: Error) => {
    poolErrors.push(error);
  };
  try {
    const first = await openRecordStore({ driver: 'postgresql', url: database.url, onPoolError });
    try {
      const second = await openRecordStore({
        driver: 'postgresql',
        url: database.url,
        onPoolError,
      });
      try {
        const queue = new JobQueue(first, 2);
        const competing = new JobQueue(second, 2);
        await queue.enqueue('intake', randomUUID(), {});
        for (const id of [randomUUID(), randomUUID()])
          await queue.enqueue('ai_execution', id, { execution_id: id });
        const content = await queue.claim('first', ['intake']);
        assert(content);
        const claimed = (
          await Promise.all([
            queue.claimBatch('first', { kinds: ['ai_execution'] }),
            competing.claimBatch('second', { kinds: ['ai_execution'] }),
          ])
        ).flat();
        assert.equal(claimed.length, 1);
        assert.equal(claimed[0].attempt, 1);
        assert.equal(claimed[0].lease_epoch, 1);
        await first.put('jobs', { ...content, cancel_requested: true });
        assert.deepEqual(await competing.claimBatch('second'), []);
        const rollback = new Error('取消回调回滚');
        await assert.rejects(
          () =>
            queue.cancelRequested(() => {
              throw rollback;
            }),
          rollback,
        );
        assert.equal((await second.get('jobs', content.id))?.state, 'running');
        assert.deepEqual(await competing.claimBatch('second'), []);
        const cancelled: string[] = [];
        await queue.cancelRequested((job) => {
          cancelled.push(job.id);
        });
        assert.deepEqual(cancelled, [content.id]);
        assert.equal((await second.get('jobs', content.id))?.state, 'cancelled');
        assert.deepEqual(await second.listCancellationRequestedJobs(), []);
        const next = await competing.claim('second');
        assert(next);
        assert.notEqual(next.id, claimed[0].id);
        assert.equal((await first.listRunningJobIds(Date.now())).length, 2);
      } finally {
        await second.close();
      }
    } finally {
      await first.close();
    }
    assert.deepEqual(poolErrors, []);
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

test('PostgreSQL 并发提交平台反馈仍分配唯一编号，编号可用于读取原反馈', async (context) => {
  const database = await externalDatabase();
  try {
    const url = new URL(database.url);
    url.searchParams.set('options', '-c default_transaction_isolation=repeatable\\ read');
    const fixture = await createTestHub(context, {
      database: { driver: 'postgresql', url: url.toString(), poolSize: 4 },
    });
    try {
      const clients = await Promise.all(
        ['owner', 'reader', 'reviewer'].map((username) => signIn(fixture, username)),
      );
      const created = await Promise.all(
        clients.map((client, index) =>
          client
            .post('/api/hub-feedback')
            .set('Idempotency-Key', randomUUID())
            .field(
              'metadata',
              JSON.stringify({
                kind: 'bug',
                surface: 'web',
                title: `Concurrent feedback ${index}`,
                description: 'Submitted concurrently over HTTP.',
              }),
            )
            .expect(201),
        ),
      );
      const numbers = created.map(({ body }: { body: HubFeedbackDetailResponse }) => body.number);
      assert.deepEqual(
        numbers.toSorted((a, b) => a - b),
        [1, 2, 3],
      );
      const page = { status: 'open' as const, page: 2, limit: 2 };
      const second = await fixture.store.listHubFeedback(page);
      assert.equal(second.total, 3);
      assert.equal(second.items.length, 1);
      assert.deepEqual(await fixture.store.listHubFeedback({ ...page, page: 3 }), {
        items: [],
        total: 3,
      });
      for (const [index, response] of created.entries()) {
        const feedback: HubFeedbackDetailResponse = response.body;
        const found = await clients[index].get(`/api/hub-feedback/${feedback.number}`).expect(200);
        assert.equal(found.body.id, feedback.id);
      }
    } finally {
      await fixture.close();
    }
  } finally {
    await database.close();
  }
});

test('平台反馈附件存入受限 MinIO 存储桶并经反馈接口读回原内容', async (context) => {
  const resource = await externalBucket();
  try {
    const fixture = await createTestHub(context, {
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
      const submitter = await signIn(fixture, 'reader');
      const bytes = Buffer.from('反馈附件\nOriginal output\n', 'utf8');
      const uploaded = await submitter
        .post('/api/hub-feedback')
        .set('Idempotency-Key', randomUUID())
        .field(
          'metadata',
          JSON.stringify({
            kind: 'bug',
            surface: 'web',
            title: 'Upload a reproduction log',
            description: 'The attached log shows how to reproduce the issue.',
            files: [{ part: 0, kind: 'text', name: 'reproduction.txt' }],
          }),
        )
        .attach('files', bytes, 'reproduction.txt')
        .expect(201);
      const object = await resource.admin.statObject(resource.bucket, `blobs/${sha256(bytes)}`);
      assert.equal(object.size, bytes.length);
      const feedback: HubFeedbackDetailResponse = uploaded.body;
      const [attachment] = feedback.attachments;
      const downloaded = await submitter
        .get(`/api/hub-feedback/${feedback.id}/attachments/${attachment.id}`)
        .expect(200);
      assert.deepEqual(Buffer.from(downloaded.text, 'utf8'), bytes);
    } finally {
      await fixture.close();
    }
  } finally {
    await resource.close();
  }
});

test('PostgreSQL 提示单例只读调度列、写入不改目录修订，重复写入串行到同一行', async (context) => {
  const database = await externalDatabase();
  try {
    const fixture = await createTestHub(context, {
      database: { driver: 'postgresql', url: database.url, poolSize: 4 },
    });
    try {
      const { store } = fixture;
      assert.equal(await store.catalogPromptSchedule(), undefined);
      const revision = await store.revision();
      const state = {
        id: 'catalog-prompts' as const,
        next_refresh_at: Date.now() + 60_000,
        active_job_id: null,
        window: null,
        cursor: null,
        batches: [],
        updated_at: new Date().toISOString(),
      };
      await store.insert('catalog_prompts', state);
      assert.deepEqual(await store.catalogPromptSchedule(), {
        next_refresh_at: state.next_refresh_at,
        active_job_id: null,
      });
      assert.equal(await store.revision(), revision);
      await Promise.all(
        Array.from({ length: 8 }, () =>
          store.tx(async () => {
            const current = await store.get('catalog_prompts', 'catalog-prompts');
            assert(current);
            await store.put('catalog_prompts', {
              ...current,
              next_refresh_at: current.next_refresh_at + 1,
            });
          }),
        ),
      );
      const [row] = await store.all('catalog_prompts');
      assert.equal(row.next_refresh_at, state.next_refresh_at + 8);
    } finally {
      await fixture.close();
    }
  } finally {
    await database.close();
  }
});
