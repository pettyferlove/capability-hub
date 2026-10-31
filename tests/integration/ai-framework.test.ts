import assert from 'node:assert/strict';
import { test } from 'node:test';
import { z } from 'zod';
import { AiError } from '@capability-hub/ai';
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
    assert.equal(
      (await hub.runtime.store.list('ai_traces', { execution_id: execution.id, limit: 10 })).length,
      1,
    );
  });

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
