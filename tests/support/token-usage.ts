import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { AiRecordMap, ExecutionRecord } from '@capability-hub/ai/records';
import { tokenUsageResponseSchema, type TokenUsagePeriod } from '@capability-hub/contracts';
import type { TestHub } from './application.js';
import { signIn } from './http.js';

/** 同一组跨时区边界、跨执行和部分用量样本供两种数据库核对。 */
export async function assertProjectTokenUsage(fixture: TestHub) {
  const runtime = fixture.hub.ai.runtime;
  const base = await runtime.submit(fixture.admin.id, 'assistant', { prompt: '测试私有任务正文' });
  const id = randomUUID();
  const other = await runtime.store.insert('ai_executions', {
    ...base,
    id,
    execution_id: id,
    owner_id: fixture.reader.id,
    payload: {
      ...base.payload,
      operation_id: 'resource-audit',
      model_profile: 'execution-profile',
    },
  });
  let position = 0;
  async function call(
    parent: ExecutionRecord,
    at: string,
    profile: string,
    status: AiRecordMap['ai_calls']['status'],
    input: number,
    output: number,
  ) {
    await runtime.store.insert('ai_calls', {
      id: randomUUID(),
      execution_id: parent.id,
      owner_id: parent.owner_id,
      lookup_key: parent.id,
      created_at: at,
      updated_at: at,
      position: ++position,
      status,
      payload: {
        profile,
        attempt: 1,
        input_tokens: input,
        output_tokens: output,
        duration_ms: 1,
        error_code: null,
      },
    });
  }
  await call(other, '2026-08-31T15:59:59.999Z', 'retired', 'succeeded', 1000, 50);
  await call(base, '2026-10-31T15:59:59.999Z', 'fixture', 'succeeded', 10, 5);
  await call(other, '2026-10-31T16:00:00.000Z', 'retired', 'succeeded', 20, 5);
  await call(base, '2026-11-01T16:00:00.000Z', 'fixture', 'succeeded', 30, 7);
  await call(other, '2026-11-02T06:00:00.000Z', 'retired', 'failed', 9, 2);
  await call(base, '2026-11-02T06:10:00.000Z', 'fixture', 'unknown', 3, 0);
  await call(base, '2026-11-02T06:30:00.000Z', 'fixture', 'pending', 0, 0);
  await call(base, '2026-11-02T06:30:00.001Z', 'future-profile', 'succeeded', 12000, 11000);
  const admin = await signIn(fixture);
  const get = async (period?: TokenUsagePeriod) => {
    const response = await admin
      .get('/api/admin/token-usage')
      .query(period ? { period } : {})
      .expect(200);
    assert.doesNotMatch(response.text, /测试私有任务正文|execution-profile|future-profile/);
    return tokenUsageResponseSchema.parse(response.body);
  };
  const all = await get();
  assert.equal(all.period, 'all');
  assert.equal(all.granularity, 'month');
  assert.equal(all.from, null);
  assert.deepEqual(all.totals, {
    requests: 7,
    input_tokens: 1060,
    output_tokens: 67,
    unknown_requests: 2,
    pending_requests: 1,
    partial_input_tokens: 12,
    partial_output_tokens: 2,
  });
  assert.deepEqual(
    all.trend.map((row) => [row.bucket, row.input_tokens, row.output_tokens]),
    [
      ['2026-08', 1000, 50],
      ['2026-09', 0, 0],
      ['2026-10', 10, 5],
      ['2026-11', 50, 12],
    ],
  );
  assert.deepEqual(
    all.by_agent.map((row) => [row.id, row.input_tokens, row.requests]),
    [
      ['resource-audit', 1020, 3],
      ['assistant', 40, 4],
    ],
  );
  assert.deepEqual(
    all.by_profile.map((row) => [row.id, row.label, row.output_tokens]),
    [
      ['retired', 'retired', 55],
      ['fixture', 'Fixture', 12],
    ],
  );
  assert.deepEqual(
    all.by_user.map((row) => [row.id, row.label, row.unknown_requests]),
    [
      [fixture.reader.id, fixture.reader.display_name, 1],
      [fixture.admin.id, fixture.admin.display_name, 1],
    ],
  );
  const today = await get('today');
  assert.equal(today.from, '2026-11-01T16:00:00.000Z');
  assert.equal(today.totals.requests, 4);
  assert.equal(today.totals.input_tokens, 30);
  assert.deepEqual(
    today.trend.map((row) => row.bucket),
    ['2026-11-02'],
  );
  for (const [period, length] of [
    ['7d', 7],
    ['30d', 30],
  ] as const) {
    const result = await get(period);
    assert.equal(result.trend.length, length);
    assert.equal(result.granularity, 'day');
    assert.equal(result.totals.requests, 6);
    assert.equal(result.totals.input_tokens, 60);
  }
}
