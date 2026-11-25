import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setImmediate } from 'node:timers/promises';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import { z } from 'zod';
import { aiConfigurationSchema } from '@capability-hub/ai';
import { purgeAiExchanges, purgeAiHistory } from '@capability-hub/infrastructure/ai';
import { openRecordStore } from '@capability-hub/infrastructure/store';
import { createSqliteStore, deferred } from '../support/store.js';
import { catalogPromptState } from '../support/migrations.js';
import { createTestHub, receiveSkill } from '../support/application.js';
import { openAiJson, serveModelStub } from '../support/model-provider-stub.js';
import { frameworkConfig } from '../support/ai-framework.js';

const group = (name: string) => ({ id: randomUUID(), name, active: true, revision: 1 });

test('事务回滚撤销全部写入，即使调用方捕获了数据库错误或嵌套事务错误', async (context) => {
  const { store } = await createSqliteStore(context);
  const duplicate = group('团队');
  await assert.rejects(() =>
    store.tx(async () => {
      await store.insert('groups', duplicate);
      await assert.rejects(() => store.insert('groups', duplicate));
      await store.insert('groups', group('不应提交'));
    }),
  );
  assert.deepEqual(await store.all('groups'), []);
  await assert.rejects(
    () =>
      store.tx(async () => {
        await store.insert('groups', group('外层'));
        try {
          await store.tx(async () => {
            await store.insert('groups', group('内层'));
            throw new Error('嵌套失败');
          });
        } catch {}
      }),
    /嵌套失败/,
  );
  assert.deepEqual(await store.all('groups'), []);
});

test('等待所有并发写入后可整体提交，数据库返回的副本不能直接修改存储', async (context) => {
  const { store } = await createSqliteStore(context);
  const groups = [group('第一组'), group('第二组')];
  await store.tx(async () => {
    await Promise.all(groups.map((value) => store.insert('groups', value)));
  });
  assert.equal((await store.all('groups')).length, 2);
  const first = await store.get('groups', groups[0].id);
  assert(first);
  first.name = '未提交的编辑';
  assert.equal((await store.get('groups', first.id))?.name, '第一组');
});

test('事务回调结束前未等待的写入触发整体回滚', async (context) => {
  const { store } = await createSqliteStore(context);
  let pending: Promise<unknown> | undefined;
  await assert.rejects(
    () =>
      store.tx(() => {
        pending = store.insert('groups', group('越界写入'));
        void pending.catch(() => {});
      }),
    /unfinished|completed/,
  );
  await Promise.allSettled([pending!]);
  assert.deepEqual(await store.all('groups'), []);
});

test('事务中启动的迟到任务不能在提交后写入', async (context) => {
  const { store } = await createSqliteStore(context);
  const gate = deferred();
  let late!: Promise<unknown>;
  await store.tx(async () => {
    late = (async () => {
      await gate.promise;
      return await store.insert('groups', group('迟到写入'));
    })();
    await store.insert('groups', group('正常写入'));
  });
  gate.resolve();
  await assert.rejects(late, /completed/);
  assert.equal((await store.all('groups')).length, 1);
});

test('事务内关闭存储被拒绝并回滚，存储仍能继续使用', async (context) => {
  const { store } = await createSqliteStore(context);
  await assert.rejects(
    () =>
      store.tx(async () => {
        await store.insert('groups', group('未提交'));
        try {
          await store.close();
        } catch {}
      }),
    /Cannot close/,
  );
  assert.deepEqual(await store.all('groups'), []);
  await store.health();
});

test('同文件第二个连接异步等待事务释放，重复关闭返回同一任务', async (context) => {
  const { store, path } = await createSqliteStore(context);
  const entered = deferred();
  const gate = deferred();
  const transaction = store.tx(async () => {
    entered.resolve();
    await gate.promise;
  });
  await entered.promise;
  let opened = false;
  const opening = openRecordStore({ driver: 'sqlite', path }).then((connection) => {
    opened = true;
    return connection;
  });
  try {
    await setImmediate();
    assert.equal(opened, false);
  } finally {
    gate.resolve();
  }
  await transaction;
  const second = await opening;
  const closing = second.close();
  assert.equal(second.close(), closing);
  await closing;
  await assert.rejects(() => second.health(), /closing|closed/);
});

test('审计追加后不能修改或删除，目录修订随实际业务变更失效', async (context) => {
  const { store } = await createSqliteStore(context);
  const before = await store.revision();
  const value = await store.insert('groups', group('审计团队'));
  const afterInsert = await store.revision();
  assert.notEqual(afterInsert, before);
  await store.audit('system', 'identity.group_created', value.id);
  const [event] = await store.all('audit');
  assert.equal(event.subject?.name, '审计团队');
  await assert.rejects(() => store.put('audit', { ...event, reason: '修改证据' }));
  await assert.rejects(() => store.remove('audit', event.id));
  await store.put('groups', { ...value, name: '更名后', revision: 2 });
  assert.notEqual(await store.revision(), afterInsert);
  assert.equal((await store.get('audit', event.id))?.subject?.name, '审计团队');
});

test('提示调度只读生成列，插入前为空，插入和替换后反映正文', async (context) => {
  const { store } = await createSqliteStore(context);
  assert.equal(await store.catalogPromptSchedule(), undefined);
  const state = await store.insert('catalog_prompts', catalogPromptState(1_000));
  assert.deepEqual(await store.catalogPromptSchedule(), {
    next_refresh_at: 1_000,
    active_job_id: null,
  });
  const jobId = randomUUID();
  await store.put('catalog_prompts', {
    ...state,
    next_refresh_at: 2_000,
    active_job_id: jobId,
    window: { start: 2_000, job_id: jobId, reserved: 0, deadline: null },
  });
  assert.deepEqual(await store.catalogPromptSchedule(), {
    next_refresh_at: 2_000,
    active_job_id: jobId,
  });
});

test('写入提示单例不改变目录修订', async (context) => {
  const { store } = await createSqliteStore(context);
  const before = await store.revision();
  const state = await store.insert('catalog_prompts', catalogPromptState(1_000));
  await store.put('catalog_prompts', { ...state, next_refresh_at: 2_000 });
  assert.equal(await store.revision(), before);
});

test('写入前拒绝不符合当前结构的记录，捕获校验异常也不能提交其他写入', async (context) => {
  const { store } = await createSqliteStore(context);
  const invalid = { ...group('无效记录'), active: 'true' } as unknown as Parameters<
    typeof store.insert<'groups'>
  >[1];
  await assert.rejects(() => store.insert('groups', invalid));
  assert.deepEqual(await store.all('groups'), []);
  const valid = group('原记录');
  await store.insert('groups', valid);
  await assert.rejects(() =>
    store.tx(async () => {
      await store.insert('groups', group('应回滚'));
      await assert.rejects(() => store.put('groups', { ...valid, revision: 0 }));
    }),
  );
  assert.deepEqual(await store.all('groups'), [valid]);
});

test('候选删除清除损坏原文，已派发的内联调用晚返回只结算真实用量', async (t) => {
  const stub = await serveModelStub(t);
  const profile = stub.profile('openai');
  const f = await createTestHub(t, {
    ai: aiConfigurationSchema.parse({ profiles: [profile], default_profile: profile.id }),
  });
  const candidate = await receiveSkill(f);
  const runtime = f.hub.ai.runtime;
  const pending = deferred();
  const release = deferred();
  const options = {
    operationId: 'resource-evaluation',
    ownerId: 'system',
    profileId: profile.id,
    signal: new AbortController().signal,
  };
  const request = {
    operation: 'resource-evaluation/check',
    instructions: '返回空对象',
    input: '待删除的候选内容',
    schema: z.strictObject({}),
    subject: candidate.version_id,
  };
  const work = runtime.runInline(options, async (run) => {
    await run.call('first', request);
    stub.setHandler(async () => {
      pending.resolve();
      await release.promise;
      return { json: openAiJson({}) };
    });
    await run.call('late', request);
  });
  try {
    await Promise.race([pending.promise, work.then(() => assert.fail('第二次调用未派发'))]);
    const sql = new DatabaseSync(join(f.directory, 'hub.sqlite'));
    try {
      const change = sql
        .prepare(
          `UPDATE ai_exchanges SET data = json_set(data, '$.payload.response.text', null)
           WHERE lookup_key = ?`,
        )
        .run(candidate.version_id);
      assert.equal(change.changes, 1);
    } finally {
      sql.close();
    }
    const asset = await f.hub.assetAccess.getAsset(candidate.asset_id);
    await f.hub.lifecycle.deleteAsset(
      f.admin,
      asset.id,
      { reason: '放弃发布' },
      `"${asset.revision}"`,
      randomUUID(),
    );
    assert.equal(await f.store.get('versions', candidate.version_id), undefined);
  } finally {
    release.resolve();
    await work;
  }
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
  assert.deepEqual(await runtime.store.listExchangeRefs(execution.id), []);
});

test('SQLite 每轮最多删除 500 条含损坏正文的到期原文，执行历史清理也不解码正文', async (t) => {
  const f = await createTestHub(t, { ai: frameworkConfig() });
  const runtime = f.hub.ai.runtime;
  const execution = await runtime.submit(f.admin.id, 'assistant', { prompt: '保留期夹具' });
  const cutoff = Date.now() - 40 * 86_400_000;
  const sql = new DatabaseSync(join(f.directory, 'hub.sqlite'));
  try {
    const data = JSON.stringify({
      execution_id: execution.id,
      owner_id: f.admin.id,
      lookup_key: '',
      status: 'stored',
      created_at: execution.created_at,
      updated_at: execution.updated_at,
      payload: { resource_refs: [], request: null },
    });
    sql
      .prepare(
        `WITH RECURSIVE seq(n) AS (VALUES(1) UNION ALL SELECT n + 1 FROM seq WHERE n < 502)
         INSERT INTO ai_exchanges (id, data)
         SELECT 'sample-' || n, json_set(?, '$.id', 'sample-' || n, '$.position', ? + (n = 502))
         FROM seq`,
      )
      .run(data, cutoff);
  } finally {
    sql.close();
  }
  assert.deepEqual(
    (await runtime.store.listExchangeRefs(execution.id, undefined, cutoff)).map((row) => row.id),
    ['sample-502'],
  );
  const now = cutoff + 86_400_000;
  assert.equal(await purgeAiExchanges(f.store, 1, now), 500);
  assert.equal((await runtime.store.listExchangeRefs(execution.id)).length, 2);
  assert.equal(await purgeAiExchanges(f.store, 1, now), 1);
  assert.equal(await purgeAiExchanges(f.store, 1, now), 0);
  await runtime.cancel(execution.id, f.admin.id, execution.payload.revision);
  const cancelled = await runtime.get(execution.id);
  await runtime.store.put('ai_executions', {
    ...cancelled,
    position: cutoff,
    updated_at: new Date(cutoff).toISOString(),
  });
  assert.equal(await purgeAiHistory(f.store), 1);
  assert.deepEqual(await runtime.store.listExchangeRefs(execution.id), []);
});
