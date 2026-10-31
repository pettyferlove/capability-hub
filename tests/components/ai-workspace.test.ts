import '../support/dom.js';
import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { createElement, useState } from 'react';
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { aiExecutionViewResponseSchema, aiEventResponseSchema } from '@capability-hub/contracts';
import { applyAiEvent, useAiExecution } from '../../apps/web/src/features/ai/use-ai-execution.js';
import { useAiCommand } from '../../apps/web/src/features/ai/use-ai-command.js';
import { SchemaFields, initialValues } from '../../apps/web/src/features/ai/SchemaFields.js';

afterEach(cleanup);
test('AI UI 按块和 UTF-16 偏移应用增量，去重并拒绝跨执行与缺口', () => {
  const now = new Date().toISOString();
  const view = aiExecutionViewResponseSchema.parse({
    execution: {
      id: 'execution',
      owner_id: 'owner',
      operation_id: 'assistant',
      model_profile: 'primary',
      status: 'running',
      revision: 1,
      attempt: 1,
      continuation: 0,
      input: {},
      result: null,
      created_at: now,
      updated_at: now,
      deadline: Date.now() + 10000,
      last_seq: 0,
      message_text: '',
      message_blocks: [],
      usage: { requests: 1, tools: 0, input_tokens: 0, output_tokens: 0, unknown_requests: 0 },
      error: null,
    },
    interactions: [],
    artifacts: [],
    activity: [],
    activity_truncated: false,
    watermark: 0,
  });
  const event = (seq: number, type: string, data: unknown) =>
    aiEventResponseSchema.parse({
      schema_version: 1,
      execution_id: 'execution',
      audience: 'operator',
      seq,
      type,
      attempt: 1,
      continuation: 0,
      occurred_at: now,
      data,
    });
  const started = applyAiEvent(
    view,
    event(1, 'message.started', { block_id: 'a', message_id: 'agent:a', format: 'text' }),
  );
  const delta = event(2, 'message.delta', {
    block_id: 'a',
    message_id: 'agent:a',
    offset: 0,
    delta: '😀',
  });
  const first = applyAiEvent(started, delta);
  assert.equal(applyAiEvent(first, delta), first);
  const next = applyAiEvent(
    first,
    event(3, 'message.delta', { block_id: 'a', message_id: 'agent:a', offset: 2, delta: '好' }),
  );
  assert.equal(next.execution.message_blocks[0]?.text, '😀好');
  assert.equal(started.execution.message_blocks[0]?.text, '');
  assert.throws(
    () =>
      applyAiEvent(
        first,
        event(4, 'message.delta', { block_id: 'a', message_id: 'agent:a', offset: 2, delta: 'x' }),
      ),
    /序号/,
  );
  assert.throws(
    () =>
      applyAiEvent(
        first,
        event(3, 'message.delta', { block_id: 'a', message_id: 'agent:a', offset: 1, delta: 'x' }),
      ),
    /偏移/,
  );
  assert.throws(
    () => applyAiEvent(first, { ...event(3, 'execution.started', {}), execution_id: 'foreign' }),
    /当前执行/,
  );
  let live = applyAiEvent(
    next,
    event(4, 'tool.started', { tool_id: 'inspect-text', invocation_id: 'tool' }),
  );
  for (let index = 0; index < 1005; index++)
    live = applyAiEvent(
      live,
      event(live.watermark + 1, 'message.delta', {
        block_id: 'a',
        message_id: 'agent:a',
        offset: live.execution.message_blocks[0]!.text.length,
        delta: '字',
      }),
    );
  assert.deepEqual(
    live.activity.map((item) => item.type),
    ['message.started', 'tool.started'],
  );
  assert.equal(live.activity_truncated, false);
  for (let index = 0; index < 1001; index++)
    live = applyAiEvent(
      live,
      event(live.watermark + 1, 'step.completed', { step_id: 'step', duration_ms: 1 }),
    );
  assert.equal(live.activity.length, 1000);
  assert.equal(live.activity_truncated, true);
  assert.equal(aiExecutionViewResponseSchema.safeParse(live).success, true);
  assert.equal(
    aiExecutionViewResponseSchema.safeParse({ ...live, activity: [...live.activity].reverse() })
      .success,
    false,
  );
  assert.equal(
    aiExecutionViewResponseSchema.safeParse({
      ...live,
      activity: [{ ...live.activity[0], execution_id: 'foreign' }],
    }).success,
    false,
  );
  assert.equal(
    aiExecutionViewResponseSchema.safeParse({
      ...live,
      activity: [event(live.watermark + 1, 'step.started', { step_id: 'future' })],
    }).success,
    false,
  );
});

test('AI Schema 表单保留布尔、数字枚举和嵌套 JSON 类型并阻止无效 JSON 提交', () => {
  const schema = {
    type: 'object',
    required: ['approved', 'priority', 'options'],
    properties: {
      approved: { type: 'boolean' },
      priority: { type: 'number', enum: [1, 2], title: '优先级' },
      options: { type: 'object', title: '高级参数' },
    },
  };
  let latest = initialValues(schema);
  function Form() {
    const [value, setValue] = useState(latest);
    return createElement(
      'form',
      null,
      createElement(SchemaFields, {
        schema,
        value,
        onChange: (next) => {
          latest = next;
          setValue(next);
        },
      }),
    );
  }
  render(createElement(Form));
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.change(screen.getByLabelText('优先级'), { target: { value: '2' } });
  const json = screen.getByLabelText('高级参数') as HTMLTextAreaElement;
  fireEvent.change(json, { target: { value: '{invalid' } });
  assert.equal(json.checkValidity(), false);
  assert.deepEqual(latest.options, {});
  fireEvent.change(json, { target: { value: '{"limit":3}' } });
  assert.equal(json.checkValidity(), true);
  assert.deepEqual(latest, { approved: true, priority: 2, options: { limit: 3 } });
});

test('AI 命令在响应丢失后使用原幂等键重试，内容或修订变化时使用新键', async (t) => {
  const requests: { key: string | null; revision: string | null; body: unknown }[] = [];
  let fail = true;
  t.mock.method(globalThis, 'fetch', async (_path: unknown, init: RequestInit) => {
    const headers = new Headers(init.headers);
    requests.push({
      key: headers.get('Idempotency-Key'),
      revision: headers.get('If-Match'),
      body: JSON.parse(String(init.body)) as unknown,
    });
    if (fail) throw new TypeError('Response lost');
    return Response.json({ accepted: true });
  });
  const { result } = renderHook(useAiCommand);
  const path = '/api/ai/executions/execution/interactions/approval/respond';
  const input = { response: { approved: true } };
  await assert.rejects(() => result.current(path, input, 1), /Response lost/);
  await assert.rejects(() => result.current(path, input, 1), /Response lost/);
  assert.equal(requests[0]?.key, requests[1]?.key);
  assert.equal(requests[1]?.revision, '"1"');
  await assert.rejects(() => result.current(path, input, 2), /Response lost/);
  assert.notEqual(requests[1]?.key, requests[2]?.key);
  const changed = { response: { approved: false } };
  await assert.rejects(() => result.current(path, changed, 2), /Response lost/);
  assert.notEqual(requests[2]?.key, requests[3]?.key);
  fail = false;
  await result.current(path, changed, 2);
  assert.equal(requests[3]?.key, requests[4]?.key);
  assert.deepEqual(requests[4]?.body, changed);
  await result.current(path, changed, 2);
  assert.notEqual(requests[4]?.key, requests[5]?.key);
});

function streamView() {
  const now = new Date().toISOString();
  return aiExecutionViewResponseSchema.parse({
    execution: {
      id: 'execution',
      owner_id: 'owner',
      operation_id: 'assistant',
      model_profile: 'primary',
      status: 'running',
      revision: 1,
      attempt: 1,
      continuation: 0,
      input: {},
      result: null,
      created_at: now,
      updated_at: now,
      deadline: Date.now() + 10000,
      last_seq: 1,
      message_text: '',
      message_blocks: [],
      usage: { requests: 1, tools: 0, input_tokens: 0, output_tokens: 0, unknown_requests: 0 },
      error: null,
    },
    interactions: [],
    artifacts: [],
    activity: [],
    activity_truncated: false,
    watermark: 1,
  });
}

for (const code of ['ACCESS_REVOKED', 'STREAM_UNAVAILABLE'] as const)
  test(`AI SSE ${code} 分别停止读取或保留水位重连`, async (t) => {
    const view = streamView();
    const requests: (string | null)[] = [];
    t.mock.timers.enable({ apis: ['setTimeout'] });
    t.mock.method(globalThis, 'fetch', async (path: string, init: RequestInit) => {
      if (!path.endsWith('/events'))
        return Response.json({ ...view, execution: { ...view.execution, status: 'succeeded' } });
      requests.push(new Headers(init.headers).get('Last-Event-ID'));
      const body =
        requests.length === 1
          ? `id: execution:operator:1\nevent: stream.snapshot\ndata: ${JSON.stringify({ schema_version: 1, ...view })}\n\nevent: stream.error\ndata: ${JSON.stringify({ schema_version: 1, code })}\n\n`
          : '';
      return new Response(body, { headers: { 'Content-Type': 'text/event-stream' } });
    });
    const hook = renderHook(() => useAiExecution('execution', 0));
    await act(async () => {});
    if (code === 'ACCESS_REVOKED') {
      assert.equal(hook.result.current.view, undefined);
      assert.match(hook.result.current.error, /访问权限/);
    } else {
      assert.equal(hook.result.current.view?.watermark, 1);
      assert.equal(hook.result.current.error, '');
    }
    await act(async () => {
      t.mock.timers.tick(2000);
    });
    if (code === 'ACCESS_REVOKED') assert.deepEqual(requests, [null]);
    else {
      assert.deepEqual(requests, [null, 'execution:operator:1']);
      assert.equal(hook.result.current.view?.execution.status, 'succeeded');
      assert.equal(hook.result.current.connection, '执行已结束');
    }
    hook.unmount();
  });

test('AI SSE 反复返回同一快照和暂时错误时有界重试，不清除已读内容', async (t) => {
  const view = streamView();
  let connections = 0;
  t.mock.timers.enable({ apis: ['setTimeout'] });
  t.mock.method(globalThis, 'fetch', async () => {
    connections++;
    return new Response(
      `id: execution:operator:1\nevent: stream.snapshot\ndata: ${JSON.stringify({ schema_version: 1, ...view })}\n\nevent: stream.error\ndata: {"schema_version":1,"code":"STREAM_UNAVAILABLE"}\n\n`,
      { headers: { 'Content-Type': 'text/event-stream' } },
    );
  });
  const hook = renderHook(() => useAiExecution('execution', 0));
  await act(async () => {});
  for (let attempt = 0; attempt < 5; attempt++)
    await act(async () => {
      t.mock.timers.tick(15000);
    });
  assert.equal(connections, 5);
  assert.equal(hook.result.current.view?.watermark, 1);
  assert.match(hook.result.current.error, /暂不可用/);
  hook.unmount();
});
