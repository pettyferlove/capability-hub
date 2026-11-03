import assert from 'node:assert/strict';
import { test } from 'node:test';
import { z } from 'zod';
import { AiError } from '@capability-hub/ai';
import { executionView } from '../../apps/server/src/http/routes/ai-views.js';
import { ScopedMemoryStorage, ScopedWorkflowsStorage } from '@capability-hub/ai/storage';
import { purgeAiHistory } from '@capability-hub/infrastructure/ai';
import { fixture } from '../support/ai-provider.js';
import { frameworkFixture, frameworkConfig } from '../support/ai-framework.js';
import { recoveryRuntime } from '../support/ai-recovery.js';

for (const format of ['openai', 'anthropic'] as const)
  test(`AI ${format} 原生结构化输出通过 Schema 校验`, { timeout: 20000 }, async (t) => {
    const provider = await fixture(format, 'json');
    t.after(() => provider.close());
    const hub = await frameworkFixture(t, frameworkConfig(provider.url, format), (context) =>
      context.step('structure', () =>
        context.structured(
          {
            id: 'structured',
            instructions: 'Return JSON.',
            prompt: 'Return verdict ok and count 7.',
          },
          z.object({ verdict: z.literal('ok'), count: z.number().int() }).strict(),
        ),
      ),
    );
    const execution = await hub.runtime.submit(hub.admin.id, 'framework-test', {});
    await hub.run();
    const result = await hub.runtime.get(execution.id);
    assert.equal(result.status, 'succeeded', JSON.stringify(result.payload.error));
    assert.deepEqual(result.payload.result, { verdict: 'ok', count: 7 });
    const request = provider.requests[0].body;
    const system =
      format === 'anthropic'
        ? request.system
        : (request.messages as { role: string; content: string }[]).filter(
            (message) => message.role === 'system',
          );
    const instructions = JSON.stringify(system);
    assert(
      instructions.includes('\\"properties\\"'),
      '模型必须收到字段 Schema，不能只有 JSON 模式',
    );
    assert(instructions.includes('\\"required\\"'));
    assert(instructions.includes('\\"verdict\\"'));
    assert(instructions.includes('\\"count\\"'));
    assert.equal(
      (await hub.runtime.store.list('ai_traces', { execution_id: execution.id, limit: 10 })).length,
      1,
    );
  });

for (const format of ['openai', 'anthropic'] as const)
  test(`AI ${format} 非约定报告保留输出错误分类且不泄露原始校验结果`, async (t) => {
    const invalid = JSON.stringify({ 结论: 'private-model-output', 风险: '低' });
    const provider = await fixture(format, 'json', false, {
      turns: [],
      text: invalid,
      json: invalid,
    });
    t.after(provider.close);
    const hub = await frameworkFixture(t, frameworkConfig(provider.url, format), (context) =>
      context.step('report', () =>
        context.structured(
          { id: 'report', instructions: 'Return JSON.', prompt: 'Summarize the report.' },
          z.object({ summary: z.string(), risk: z.enum(['low', 'high']) }).strict(),
        ),
      ),
    );
    const submitted = await hub.runtime.submit(hub.admin.id, 'framework-test', {});
    await hub.run();
    const result = await hub.runtime.get(submitted.id);
    assert.equal(result.status, 'failed');
    assert.deepEqual(result.payload.error, {
      code: 'AI_OUTPUT_INVALID',
      message: '模型结构化结果的字段或类型不符合约定',
      retryable: false,
    });
    const snapshots = await hub.runtime.store.list('ai_snapshots', {
      execution_id: submitted.id,
      limit: 10,
    });
    assert(!JSON.stringify(snapshots).includes('private-model-output'));
    assert.equal(provider.requests.length, 2);
    const repair = executionView(await hub.runtime.view(submitted.id)).activity.find(
      (item) => item.type === 'step.started' && item.data.step_id === 'repair-output',
    );
    assert.equal(repair?.data.repair_reason, 'invalid_fields');
    assert(!JSON.stringify(provider.requests[1].body).includes('private-model-output'));
    assert(!result.payload.message_text.includes('private-model-output'));
  });

for (const format of ['openai', 'anthropic'] as const)
  for (const stop of ['length', 'stop', 'content_filter'] as const)
    test(`AI ${format} 按停止原因处理没有完整对象的报告：${stop}`, async (t) => {
      const provider = await fixture(format, 'json', false, {
        turns: [],
        text: stop === 'stop' ? ' ' : { text: ' ', stop },
        json: '{"count":7}',
      });
      t.after(provider.close);
      const hub = await frameworkFixture(t, frameworkConfig(provider.url, format), (context) =>
        context.structured(
          { id: 'report', instructions: 'Return JSON.', prompt: 'Summarize the report.' },
          z.strictObject({ count: z.number().int() }),
        ),
      );
      const submitted = await hub.runtime.submit(hub.admin.id, 'framework-test', {});
      await hub.run();
      const view = executionView(await hub.runtime.view(submitted.id));
      const calls = await hub.runtime.store.list('ai_calls', {
        execution_id: submitted.id,
        limit: 10,
      });
      const first = calls.find((call) => call.position === 1)?.payload.diagnostics;
      assert.equal(
        first?.transport?.finish_reason,
        stop === 'content_filter' ? 'content_filter' : stop,
      );
      if (stop === 'content_filter') {
        assert.equal(view.execution.status, 'failed');
        assert.equal(view.execution.error?.code, 'AI_OUTPUT_INVALID');
        assert.equal(view.execution.usage.requests, 1);
      } else {
        assert.equal(view.execution.status, 'succeeded', JSON.stringify(view.execution.error));
        assert.deepEqual(view.execution.result, { count: 7 });
        const repair = view.activity.find(
          (item) => item.type === 'step.started' && item.data.step_id === 'repair-output',
        );
        assert.equal(
          repair?.data.repair_reason,
          stop === 'length' ? 'output_limit' : 'incomplete_output',
        );
        const next = calls.find((call) => call.position === 2)?.payload.diagnostics;
        assert.equal(next?.agent_id, 'report');
        assert.deepEqual(next?.step, { id: 'repair-output', start_seq: repair?.seq });
      }
    });

for (const format of ['openai', 'anthropic'] as const)
  test(`AI ${format} 请求超时时保留响应头和输出进度，未返回的用量仍为未知`, async (t) => {
    for (const gate of ['before-headers', 'before-output', true] as const) {
      const provider = await fixture(format, 'text', gate);
      t.after(provider.close);
      const config = frameworkConfig(provider.url, format);
      config.profiles[0].request_timeout_ms = 1000;
      const hub = await frameworkFixture(t, config, (context) =>
        context.step('prepare', () =>
          context.agent({
            id: 'writer',
            instructions: 'Answer briefly.',
            prompt: 'Describe the task.',
          }),
        ),
      );
      const submitted = await hub.runtime.submit(hub.admin.id, 'framework-test', {});
      await hub.run();
      const result = await hub.runtime.get(submitted.id);
      assert.equal(result.payload.error?.message, '模型请求超时');
      assert.equal(result.payload.usage.unknown_requests, 1);
      const [call] = await hub.runtime.store.list('ai_calls', {
        execution_id: submitted.id,
        limit: 1,
      });
      const transport = call.payload.diagnostics.transport;
      assert(transport);
      assert.equal(call.payload.diagnostics.request_timeout_ms, 1000);
      assert.equal(transport.request_timed_out, true);
      assert.equal(transport.http_status, gate === 'before-headers' ? undefined : 200);
      assert.equal(transport.headers_ms !== undefined, gate !== 'before-headers');
      assert.equal(transport.received_bytes > 0, gate !== 'before-headers');
      assert.equal(transport.first_output_ms !== undefined, gate === true);
      assert.equal(transport.last_output_ms !== undefined, gate === true);
      assert.equal(transport.text_chars, gate === true ? 3 : 0);
      assert.equal(transport.terminal_received, false);
      assert.equal(transport.finish_reason, undefined);
      assert.equal(
        transport.input_tokens_reported,
        format === 'anthropic' && gate !== 'before-headers',
      );
      assert.equal(transport.output_tokens_reported, false);
    }
  });

for (const format of ['openai', 'anthropic'] as const)
  for (const local of [true, false])
    test(`AI ${format} ${local ? '本地解析字符串行号' : '按字段提示重新整理一次'}后仍严格校验`, async (t) => {
      const report = { evidence: [{ line: 7 }], verdict: 'ok' };
      const provider = await fixture(format, 'json', false, {
        turns: [],
        text: JSON.stringify({ evidence: [{ line: local ? '7' : 'not-a-line' }], verdict: 'ok' }),
        json: JSON.stringify(report),
      });
      t.after(provider.close);
      const hub = await frameworkFixture(t, frameworkConfig(provider.url, format), (context) =>
        context.structured(
          { id: 'report', instructions: 'Return JSON.', prompt: 'Summarize inspected evidence.' },
          z
            .object({
              evidence: z.array(z.object({ line: z.number().int().positive() }).strict()),
              verdict: z.literal('ok'),
            })
            .strict(),
        ),
      );
      const submitted = await hub.runtime.submit(hub.admin.id, 'framework-test', {});
      await hub.run();
      const result = await hub.runtime.get(submitted.id);
      assert.equal(result.status, 'succeeded', JSON.stringify(result.payload.error));
      assert.deepEqual(result.payload.result, report);
      assert.equal(result.payload.usage.requests, local ? 1 : 2);
      if (!local) assert(JSON.stringify(provider.requests[1].body).includes('evidence.0.line'));
    });

for (const format of ['openai', 'anthropic'] as const)
  test(
    `AI ${format} 工具续轮复用响应块标识仍保持文本和重放偏移连续`,
    { timeout: 20000 },
    async (t) => {
      const texts = ['先检查入口🔍', '继续检查引用文档', '完成检查✅'];
      const provider = await fixture(format, 'tools', false, {
        turns: texts.slice(0, 2).map((text) => ({ name: 'inspect_text', input: { text }, text })),
        text: texts[2],
        json: '{}',
      });
      t.after(provider.close);
      const hub = await frameworkFixture(t, frameworkConfig(provider.url, format), (context) =>
        context.agent({
          id: 'multi-turn',
          instructions: 'Inspect text',
          prompt: 'Read in steps',
          tools: {
            inspect_text: context.tool({
              id: 'inspect-text',
              description: 'Count',
              input: z.object({ text: z.string() }),
              output: z.object({ count: z.number() }),
              execute: async ({ text }) => ({ count: text.length }),
            }),
          },
        }),
      );
      const submitted = await hub.runtime.submit(hub.admin.id, 'framework-test', {});
      await hub.run();
      const result = await hub.runtime.get(submitted.id);
      assert.equal(result.status, 'succeeded', JSON.stringify(result.payload.error));
      assert.deepEqual(
        result.payload.message_blocks.map((block) => block.text).filter(Boolean),
        texts,
      );
      assert.equal(
        new Set(result.payload.message_blocks.map((block) => block.id)).size,
        result.payload.message_blocks.length,
      );
      assert(result.payload.message_blocks.every((block) => block.complete));
      const replay = new Map<string, string>();
      const events = await hub.runtime.store.list('ai_events', {
        execution_id: submitted.id,
        limit: 1000,
      });
      for (const { payload: event } of events) {
        const id = String(event.data.block_id);
        if (event.type === 'message.started') {
          assert(!replay.has(id));
          replay.set(id, '');
        }
        if (event.type === 'message.delta') {
          assert.equal(event.data.offset, replay.get(id)?.length);
          replay.set(id, replay.get(id)! + String(event.data.delta));
        }
        if (event.type === 'message.completed')
          assert.equal(event.data.length, replay.get(id)?.length);
      }
      assert.deepEqual([...replay.values()].filter(Boolean), texts);
      assert.equal(result.payload.message_text, texts.join(''));
    },
  );

test('AI 请求预算在第二次真实网络请求之前终止原生工具循环', { timeout: 20000 }, async (t) => {
  const provider = await fixture('openai', 'tools');
  t.after(() => provider.close());
  const config = frameworkConfig(provider.url);
  config.max_requests = 1;
  const hub = await frameworkFixture(t, config, (context) =>
    context.agent({
      id: 'budget',
      instructions: 'Use tool',
      prompt: 'Count hello',
      tools: {
        inspect_text: context.tool({
          id: 'inspect-text',
          description: 'Count',
          input: z.object({ text: z.string() }),
          output: z.object({ count: z.number() }),
          execute: async ({ text }) => ({ count: text.length }),
        }),
      },
    }),
  );
  const execution = await hub.runtime.submit(hub.admin.id, 'framework-test', {});
  await hub.run();
  const result = await hub.runtime.get(execution.id);
  assert.equal(result.status, 'failed');
  assert.equal(result.payload.error?.code, 'AI_BUDGET_EXCEEDED');
  assert.equal(provider.requests.length, 1);
});

test('AI 优雅中断保留可恢复快照并将未结算请求标为未知', { timeout: 20000 }, async (t) => {
  const provider = await fixture('openai', 'text', true);
  t.after(() => provider.close());
  const hub = await frameworkFixture(t, frameworkConfig(provider.url), (context) =>
    context.agent({ id: 'interrupt', instructions: 'Answer', prompt: 'hello' }),
  );
  const execution = await hub.runtime.submit(hub.admin.id, 'framework-test', {});
  const controller = new AbortController();
  const running = hub.run(controller.signal);
  await provider.firstDelta.promise;
  controller.abort(new AiError('AI_INTERRUPTED', 'Service stopping'));
  await running;
  assert.equal((await hub.runtime.get(execution.id)).status, 'queued');
  provider.release.resolve();
  await hub.run();
  const result = await hub.runtime.get(execution.id);
  assert.equal(result.status, 'succeeded', JSON.stringify(result.payload.error));
  assert.equal(provider.requests.length, 2);
  assert.equal(result.payload.usage.unknown_requests, 1);
});

test('AI 人工交互超时与历史保留清理不会删除活跃执行', async (t) => {
  const hub = await frameworkFixture(t, frameworkConfig(), async () => null);
  const { runtime, claim, ai } = recoveryRuntime(hub.store);
  const old = await runtime.submit(hub.admin.id, 'recoverable', { value: 1 });
  await runtime.process(await claim(), new AbortController().signal);
  const waiting = await runtime.get(old.id);
  waiting.payload.deadline = Date.now() - 1;
  await ai.put('ai_executions', waiting);
  await runtime.expireWaiting();
  const result = await runtime.view(old.id);
  assert.equal(result.execution.status, 'timed_out');
  assert.equal(result.interactions[0]?.status, 'cancelled');
  const active = await runtime.submit(hub.admin.id, 'recoverable', { value: 2 });
  for (const row of [result.execution, active]) {
    row.position = Date.now() - 40 * 86400000;
    row.updated_at = new Date(row.position).toISOString();
    await ai.put('ai_executions', row);
  }
  assert.equal(await purgeAiHistory(hub.store), 1);
  assert.equal(await ai.get('ai_executions', old.id), undefined);
  assert(await ai.get('ai_executions', active.id));
});

test('AI 记忆读取、更新和删除均限制当前执行及所有者', async (t) => {
  const hub = await frameworkFixture(t, frameworkConfig(), async (context) => {
    const memory = new ScopedMemoryStorage(context.scope);
    const now = new Date();
    await memory.saveThread({
      thread: {
        id: 'thread',
        resourceId: context.ownerId,
        title: 'hello',
        createdAt: now,
        updatedAt: now,
      },
    });
    await memory.updateThread({ id: 'thread', title: 'updated' });
    assert.equal((await memory.getThreadById({ threadId: 'thread' }))?.title, 'updated');
    const scope = context.scope.current();
    const other = { ...scope, owner_id: 'another-user' };
    await context.scope.run(other, async () => {
      await assert.rejects(() => memory.getThreadById({ threadId: 'thread' }), /不属于/);
      await assert.rejects(
        () => memory.deleteThread({ threadId: 'thread' }),
        /不属于|不匹配|归属已失效/,
      );
    });
    await memory.deleteThread({ threadId: 'thread' });
    assert.equal(await memory.getThreadById({ threadId: 'thread' }), null);
    return null;
  });
  const execution = await hub.runtime.submit(hub.admin.id, 'framework-test', {});
  await hub.run();
  assert.deepEqual(hub.failures, []);
  assert.equal((await hub.runtime.get(execution.id)).status, 'succeeded');
});

test('AI 原生快照 CAS 拒绝不存在或状态不匹配的更新', async (t) => {
  const hub = await frameworkFixture(t, frameworkConfig(), async (context) => {
    const workflows = new ScopedWorkflowsStorage(context.scope);
    const execution = await context.scope.read();
    const key = { workflowName: 'framework-test', runId: execution.payload.native_run_id };
    const snapshot = await workflows.loadWorkflowSnapshot(key);
    assert(snapshot);
    assert.equal(
      await workflows.persistWorkflowSnapshot({ ...key, snapshot, expectedStatus: 'success' }),
      false,
    );
    assert.equal(
      await workflows.persistWorkflowSnapshot({
        ...key,
        runId: 'absent',
        snapshot: { ...snapshot, runId: 'absent' },
        expectedStatus: 'running',
      }),
      false,
    );
    assert.equal(await workflows.loadWorkflowSnapshot({ ...key, runId: 'absent' }), null);
    return null;
  });
  const execution = await hub.runtime.submit(hub.admin.id, 'framework-test', {});
  await hub.run();
  assert.deepEqual(hub.failures, []);
  assert.equal((await hub.runtime.get(execution.id)).status, 'succeeded');
});
