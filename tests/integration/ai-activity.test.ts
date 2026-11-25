import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { ShortModelError, aiConfigurationSchema } from '@capability-hub/ai';
import { createApp } from '@capability-hub/server';
import { aiExecutionDiagnosticsResponseSchema } from '@capability-hub/contracts';
import { createSqliteStore } from '../support/store.js';
import { assertActivityHistory } from '../support/ai-activity.js';
import { createTestHub, publishSkill, type TestHub } from '../support/application.js';
import { signIn } from '../support/http.js';
import { frameworkConfig } from '../support/ai-framework.js';
import { serveModelStub } from '../support/model-provider-stub.js';

test('SQLite 活动快照先过滤文本增量再分页，并按执行和水位隔离', async (t) => {
  const { store } = await createSqliteStore(t);
  await assertActivityHistory(store);
});

test('诊断导出跨越活动窗口并标明缺口，交接材料只包含授权的流程数据', async (t) => {
  const f = await createTestHub(t);
  const { intake } = await publishSkill(f);
  const runtime = f.hub.ai.runtime;
  Object.assign(runtime.config, frameworkConfig());
  const row = await runtime.submit(f.admin.id, 'assistant', { prompt: '核对 ``` 工具流程' });
  await runtime.submit(f.admin.id, 'assistant', { prompt: '其他执行资料' });
  const base = {
    owner_id: row.owner_id,
    execution_id: row.id,
    lookup_key: row.id,
    position: 1,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
  const reference = 'version:' + intake.version_id + '/SKILL.md';
  await runtime.store.tx(async () => {
    await runtime.store.insert('ai_artifacts', {
      ...base,
      id: 'evidence',
      status: 'committed',
      payload: {
        name: 'resource:test',
        digest: 'artifact-hash',
        media_type: 'application/json',
        content: { id: reference, digest: 'content-hash', text: '内部资源原文' },
      },
    });
    await runtime.store.insert('ai_effects', {
      ...base,
      id: 'receipt',
      status: 'committed',
      payload: { tool_id: 'change', arguments_digest: 'hash', result: { value: '内部效果结果' } },
    });
    await runtime.store.insert('ai_traces', {
      ...base,
      id: 'trace',
      status: 'completed',
      payload: {
        name: 'review',
        duration_ms: 32,
        parent_id: null,
        attributes: { private: '内部跟踪属性' },
      },
    });
    for (let i = 0; i < 1001; i++)
      await runtime.events.append(row, 'step.completed', { step_id: 'review', duration_ms: i });
  });
  assert((await runtime.view(row.id)).activity_truncated);
  const client = await signIn(f);
  const path = '/api/admin/operations/agents/executions/' + row.id + '/diagnostics';
  const response = await client.get(path).query({ download: 'json' }).expect(200);
  const report = aiExecutionDiagnosticsResponseSchema.parse(response.body);
  assert.match(response.headers['content-disposition'], /attachment;.*\.json/);
  assert.match(response.headers['cache-control'], /no-store/);
  assert.deepEqual(
    report.events.map((event) => event.seq),
    Array.from({ length: report.watermark }, (_, i) => i + 1),
  );
  assert.deepEqual(report.event_gaps, []);
  assert.deepEqual(report.resources, [{ reference, digest: 'content-hash' }]);
  assert.equal(report.effects[0].tool_id, 'change');
  assert.equal(report.traces[0].duration_ms, 32);
  assert.deepEqual(report.artifacts, []);
  const md = await client.get(path).query({ download: 'markdown' }).expect(200);
  assert.match(md.headers['content-disposition'], /attachment;.*\.md/);
  assert.match(md.text, /#1 .*execution\.queued/);
  assert.match(md.text, new RegExp('#' + report.watermark + ' .*step\\.completed'));
  assert.match(md.text, /\\u0060/);
  for (const body of [response.text, md.text])
    assert.doesNotMatch(body, /内部资源原文|内部效果结果|内部跟踪属性|其他执行资料/);
  const preview = await client.get(path).query({ view: 'handoff' }).expect(200);
  assert.match(preview.body.markdown, /# Agent 执行交接/);
  assert.equal(preview.body.watermark, report.watermark);
  const [first] = await runtime.store.list('ai_events', { execution_id: row.id, limit: 1 });
  await runtime.store.remove('ai_events', first.id);
  const incomplete = aiExecutionDiagnosticsResponseSchema.parse(
    (await client.get(path).expect(200)).body,
  );
  assert.deepEqual(incomplete.event_gaps, [{ from_seq: 1, through_seq: 1 }]);
});

async function failedDiagnosticCall(t: TestContext) {
  const stub = await serveModelStub(t);
  const profile = stub.profile('openai');
  const f = await createTestHub(t, {
    aiExchangeRetentionDays: 1,
    ai: aiConfigurationSchema.parse({ profiles: [profile], default_profile: profile.id }),
  });
  const runtime = f.hub.ai.runtime;
  await assert.rejects(
    runtime.runInline(
      {
        operationId: 'resource-evaluation',
        ownerId: 'system',
        profileId: profile.id,
        signal: new AbortController().signal,
      },
      (run) =>
        run.call('check', {
          operation: 'resource-evaluation/check',
          instructions: '返回包含 decision 的 JSON',
          input: 'diagnostic-content-marker',
          schema: z.strictObject({ decision: z.boolean() }),
        }),
    ),
    ShortModelError,
  );
  const [exchange] = await runtime.store.list('ai_exchanges', { limit: 1 });
  const path = '/api/admin/operations/agents/executions/' + exchange.execution_id;
  return { f, runtime, exchange, path };
}

test('停用留存或刚到截止时间即停止原文交付，无需等待 Worker 删除', async (t) => {
  const { f, runtime, exchange, path } = await failedDiagnosticCall(t);
  const single = `${path}/calls/${exchange.id}/exchange`;
  const snapshot = `${path}/diagnostics`;
  const checkHidden = async (fixture: TestHub) => {
    const client = await signIn(fixture);
    const report = aiExecutionDiagnosticsResponseSchema.parse(
      (await client.get(snapshot).expect(200)).body,
    );
    assert.equal(report.model_calls[0].exchange, 'none');
    assert.equal(report.model_calls[0].failure_reason, 'schema_mismatch');
    await client.get(single).expect(404);
    const json = await client.get(snapshot).query({ download: 'json' }).expect(200);
    assert.deepEqual(aiExecutionDiagnosticsResponseSchema.parse(json.body).exchanges, []);
    for (const query of [{ download: 'markdown' }, { view: 'handoff' }])
      assert.doesNotMatch(
        (await client.get(snapshot).query(query).expect(200)).text,
        /diagnostic-content-marker/,
      );
    assert(await runtime.store.get('ai_exchanges', exchange.id));
  };

  const disabled = await createApp({ ...f.config, aiExchangeRetentionDays: 0 });
  try {
    await checkHidden({ ...f, ...disabled });
  } finally {
    await disabled.close();
  }
  t.mock.timers.enable({ apis: ['Date'], now: exchange.position + 86_400_000 - 1 });
  const client = await signIn(f);
  await client.get(single).expect(200);
  assert.match(
    (await client.get(snapshot).query({ download: 'markdown' }).expect(200)).text,
    /diagnostic-content-marker/,
  );
  t.mock.timers.tick(1);
  await checkHidden(f);
});

test('完整导出超过总量上限时不交付部分 JSON，单条及致因交接仍可读', async (t) => {
  const { f, runtime, exchange, path } = await failedDiagnosticCall(t);
  const call = await runtime.store.get('ai_calls', exchange.id);
  assert(call);
  const text = 'x'.repeat(1024 * 1024);
  await runtime.store.tx(async () => {
    for (let index = 0; index < 8; index++) {
      const id = 'large-call-' + index;
      await runtime.store.insert('ai_calls', { ...call, id, position: index + 2 });
      await runtime.store.insert('ai_exchanges', {
        ...exchange,
        id,
        payload: {
          resource_refs: [],
          request: { text, bytes: text.length, truncated: true },
          response: null,
        },
      });
    }
  });
  const client = await signIn(f);
  const report = await client.get(path + '/diagnostics').expect(200);
  assert.equal(aiExecutionDiagnosticsResponseSchema.parse(report.body).model_calls.length, 9);
  const blocked = await client
    .get(path + '/diagnostics')
    .query({ download: 'json' })
    .expect(413);
  assert.equal(blocked.body.error.code, 'DIAGNOSTIC_EXPORT_TOO_LARGE');
  assert.doesNotMatch(blocked.text, /diagnostic-content-marker|xxxx/);
  const one = await client.get(path + '/calls/large-call-7/exchange').expect(200);
  assert.equal(one.body.request.text, text);
  const handoff = await client
    .get(path + '/diagnostics')
    .query({ download: 'markdown' })
    .expect(200);
  assert.match(handoff.text, /diagnostic-content-marker/);
  assert.doesNotMatch(handoff.text, /xxxx/);
});

test('历史 v1 诊断文件保留用量，但只有 v1 可以缺少原文标记', async () => {
  const file = await readFile(new URL('../fixtures/diagnostics-v1.json', import.meta.url), 'utf8');
  const snapshot = JSON.parse(file) as Record<string, unknown>;
  const report = aiExecutionDiagnosticsResponseSchema.parse(snapshot);
  assert.equal(report.schema_version, 1);
  assert.equal(report.model_calls[0].output_tokens, 7);
  assert.equal(report.model_calls[0].exchange, 'none');
  assert.equal(
    aiExecutionDiagnosticsResponseSchema.safeParse({ ...snapshot, schema_version: 2 }).success,
    false,
  );
});
