import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aiExecutionDiagnosticsResponseSchema } from '@capability-hub/contracts';
import { createSqliteStore } from '../support/store.js';
import { assertActivityHistory } from '../support/ai-activity.js';
import { createTestHub, publishSkill } from '../support/application.js';
import { signIn } from '../support/http.js';
import { frameworkConfig } from '../support/ai-framework.js';

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
  const path = '/api/ai/executions/' + row.id + '/diagnostics';
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
