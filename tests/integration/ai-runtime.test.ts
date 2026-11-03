import assert from 'node:assert/strict';
import { test } from 'node:test';
import { aiConfigurationSchema, AiRuntime, OperationRegistry } from '@capability-hub/ai';
import { createStep, createWorkflow } from '@capability-hub/ai/mastra';
import { createAiStore, HubAiQueue } from '@capability-hub/infrastructure/ai';
import { z } from 'zod';
import { createTestHub, publishSkill } from '../support/application.js';
import { fixture as providerFixture } from '../support/ai-provider.js';
import { signIn } from '../support/http.js';
import { deferred } from '../support/store.js';
import {
  aiExecutionDiagnosticsResponseSchema,
  aiExecutionViewResponseSchema,
} from '@capability-hub/contracts';
import type { AiRecordMap, AiTable } from '@capability-hub/ai/records';

function config(baseUrl = 'https://example.test/v1', format: 'openai' | 'anthropic' = 'openai') {
  return aiConfigurationSchema.parse({
    profiles: [
      {
        id: 'fixture',
        label: 'Fixture',
        format,
        base_url: baseUrl,
        model: 'fixture-model',
        credential_ref: 'AI_FIXTURE_KEY',
        allow_http: true,
      },
    ],
    default_profile: 'fixture',
  });
}

test('AI 原生暂停、持久回答、换运行时恢复与效果回执共用 Hub 事务', async (t) => {
  const hub = await createTestHub(t, { ai: config() });
  const value = z.object({ value: z.number() }).strict();
  const response = z.object({ approved: z.boolean() }).strict();
  const registry = new OperationRegistry().register({
    id: 'test-flow',
    version: '1',
    title: 'test',
    description: 'test',
    input: value,
    output: value,
    interactions: { approval: response },
    create: (context) =>
      createWorkflow({
        id: 'test-flow',
        inputSchema: value,
        outputSchema: value,
        options: { autoRestartActiveRuns: false },
        retryConfig: { attempts: 0, delay: 0 },
      })
        .then(
          createStep({
            id: 'approval',
            inputSchema: value,
            outputSchema: value,
            resumeSchema: response,
            suspendSchema: z.object({ question: z.string() }).strict(),
            execute: async ({ inputData, resumeData, suspend }) => {
              if (!resumeData) return suspend({ question: 'Continue?' });
              return { value: resumeData.approved ? inputData.value + 1 : inputData.value };
            },
          }),
        )
        .then(
          createStep({
            id: 'effect',
            inputSchema: value,
            outputSchema: value,
            execute: ({ inputData }) =>
              context.effect('local-effect', inputData, async () => {
                await hub.store.audit(hub.admin.id, 'ai.test-effect', context.executionId);
                return inputData;
              }),
          }),
        )
        .commit(),
  });
  const create = () =>
    new AiRuntime(
      createAiStore(hub.store),
      new HubAiQueue(hub.store, hub.hub.jobs),
      registry,
      {
        authorization: { authorize: async () => undefined },
        credentials: { resolve: async () => 'unused' },
        resources: {
          resolve: async () => {
            throw new Error('unused');
          },
        },
      },
      config(),
    );
  let runtime = create();
  const execution = await runtime.submit(hub.admin.id, 'test-flow', { value: 5 });
  const run = async () => {
    const job = await hub.hub.jobs.claim('test-ai-worker', ['ai_execution']);
    assert(job);
    await runtime.process(
      {
        execution_id: job.aggregate_id,
        dispatch_id: job.id,
        owner: job.lease_owner!,
        epoch: job.lease_epoch,
        attempt: job.attempt,
      },
      new AbortController().signal,
    );
  };
  await run();
  const waiting = await runtime.view(execution.id);
  assert.equal(
    waiting.execution.status,
    'waiting_input',
    JSON.stringify(waiting.execution.payload.error),
  );
  assert.equal(waiting.interactions.length, 1);
  const interaction = waiting.interactions[0]!;
  await runtime.respond(execution.id, interaction.id, hub.admin.id, interaction.payload.revision, {
    approved: true,
  });
  runtime = create();
  await run();
  const result = await runtime.view(execution.id);
  assert.equal(
    result.execution.status,
    'succeeded',
    JSON.stringify(result.execution.payload.error),
  );
  assert.deepEqual(result.execution.payload.result, { value: 6 });
  assert.equal(
    (await hub.store.all('audit')).filter((row) => row.action === 'ai.test-effect').length,
    1,
  );
  assert.equal(result.interactions[0]?.status, 'applied');
  const events = await runtime.store.list('ai_events', { execution_id: execution.id, limit: 100 });
  assert.deepEqual(
    events.map((event) => event.position),
    events.map((_, index) => index + 1),
  );
});

for (const format of ['openai', 'anthropic'] as const) {
  test(`AI 正式 HTTP 与 Worker：${format} 原生工具流及用量`, async (t) => {
    const provider = await providerFixture(format, 'tools');
    t.after(() => provider.close());
    const prior = process.env.AI_FIXTURE_KEY;
    process.env.AI_FIXTURE_KEY = 'ai-fixture-key';
    t.after(() => {
      if (prior === undefined) delete process.env.AI_FIXTURE_KEY;
      else process.env.AI_FIXTURE_KEY = prior;
    });
    const hub = await createTestHub(t, { ai: config(provider.url, format) });
    const client = await signIn(hub);
    const submitted = await client
      .post('/api/ai/executions')
      .set('Idempotency-Key', 'execute-once')
      .send({ operation_id: 'assistant', input: { prompt: '统计 hello 的字符数，然后回答。' } });
    assert.equal(submitted.status, 201, JSON.stringify(submitted.body));
    const id = String(submitted.body.id);
    await hub.worker.tick();
    await hub.worker.waitForIdle();
    const result = await client.get(`/api/ai/executions/${id}`).expect(200);
    assert.equal(
      result.body.execution.status,
      'succeeded',
      JSON.stringify(result.body.execution.error),
    );
    assert.equal(result.body.execution.usage.tools, 1);
    assert.equal(result.body.execution.usage.requests, 2);
    assert.equal(result.body.execution.usage.input_tokens, 20);
    assert.equal(result.body.execution.usage.output_tokens, 16);
    assert.equal(result.body.execution.usage.unknown_requests, 0);
    if (format === 'openai')
      assert.deepEqual(provider.requests[0]?.body.stream_options, { include_usage: true });
    const activity = aiExecutionViewResponseSchema.parse(result.body).activity;
    const diagnosticsPath = `/api/admin/operations/agents/executions/${id}/diagnostics`;
    const report = aiExecutionDiagnosticsResponseSchema.parse(
      (await client.get(diagnosticsPath).expect(200)).body,
    );
    const step = activity.find(
      (event) => event.type === 'step.started' && event.data.step_id === 'answer',
    );
    assert(step);
    for (const call of report.model_calls) {
      const observed = call.diagnostics;
      assert(observed.transport);
      assert.deepEqual(observed.step, { id: 'answer', start_seq: step.seq });
      assert.equal(observed.agent_id, 'assistant');
      assert.equal(observed.model, 'fixture-model');
      assert.equal(observed.format, format);
      assert.equal(observed.max_output_tokens, 4096);
      assert.equal(observed.transport.terminal_received, true);
      assert.equal(observed.transport.output_tokens_reported, true);
      assert.equal(observed.transport.request_timed_out, false);
    }
    assert.deepEqual(
      report.model_calls.map((call) => call.diagnostics.transport?.finish_reason),
      ['tool_call', 'stop'],
    );
    const started = activity.find((event) => event.type === 'tool.started');
    const completed = activity.find((event) => event.type === 'tool.completed');
    assert(started && completed, '历史视图应保留完整工具生命周期');
    assert.equal(started.data.invocation_id, completed.data.invocation_id);
    assert(started.seq < completed.seq);
    assert(
      activity.every(
        (event) =>
          event.execution_id === id &&
          !['message.delta', 'usage.updated', 'execution.completed'].includes(event.type),
      ),
    );
    const reopened = aiExecutionViewResponseSchema.parse(
      (await client.get(`/api/ai/executions/${id}`).expect(200)).body,
    );
    assert.deepEqual(reopened.activity, activity, '重新打开任务仍能还原工具活动');
    assert(provider.requests.every((row) => row.authenticated));
    assert.equal(
      provider.requests[0]?.path,
      format === 'openai' ? '/custom/v1/chat/completions' : '/custom/v1/messages',
    );
    const replay = await client
      .get(`/api/ai/executions/${id}/events`)
      .set('Last-Event-ID', `${id}:operator:0`)
      .expect(200);
    assert.match(replay.text, /event: message.delta/);
    assert.match(replay.text, /event: execution.completed/);
    assert.doesNotMatch(replay.text, /stream.snapshot/);
  });
}

test('AI 协作演示经 HTTP 完成并行检查、人工确认与成果保存；重复回答只调度一次', async (t) => {
  const provider = await providerFixture('openai', 'text');
  t.after(() => provider.close());
  const prior = process.env.AI_FIXTURE_KEY;
  process.env.AI_FIXTURE_KEY = 'ai-fixture-key';
  t.after(() => {
    if (prior === undefined) delete process.env.AI_FIXTURE_KEY;
    else process.env.AI_FIXTURE_KEY = prior;
  });
  const hub = await createTestHub(t, { ai: config(provider.url) });
  const client = await signIn(hub);
  const input = {
    operation_id: 'agent-lab',
    input: { topic: '资源审核流程', require_approval: true },
  };
  const first = await client
    .post('/api/ai/executions')
    .set('Idempotency-Key', 'lab-once')
    .send(input)
    .expect(201);
  const second = await client
    .post('/api/ai/executions')
    .set('Idempotency-Key', 'lab-once')
    .send(input)
    .expect(201);
  assert.equal(first.body.id, second.body.id);
  const id = String(first.body.id);
  await hub.worker.tick();
  await hub.worker.waitForIdle();
  const waiting = await client.get(`/api/ai/executions/${id}`).expect(200);
  assert.equal(
    waiting.body.execution.status,
    'waiting_input',
    JSON.stringify(waiting.body.execution.error),
  );
  assert.equal(provider.requests.length, 3);
  const interaction = waiting.body.interactions[0] as { id: string; revision: number };
  const path = `/api/ai/executions/${id}/interactions/${interaction.id}/respond`;
  await client
    .post(path)
    .set('Idempotency-Key', 'missing-revision')
    .send({ response: { approved: true } })
    .expect(428);
  await client
    .post(path)
    .set('Idempotency-Key', 'stale-revision')
    .set('If-Match', '"9"')
    .send({ response: { approved: true } })
    .expect(412);
  for (let i = 0; i < 2; i++)
    await client
      .post(path)
      .set('Idempotency-Key', 'approve-once')
      .set('If-Match', `"${interaction.revision}"`)
      .send({ response: { approved: true, comment: '采用' } })
      .expect(200);
  await hub.worker.tick();
  await hub.worker.waitForIdle();
  const result = await client.get(`/api/ai/executions/${id}`).expect(200);
  assert.equal(
    result.body.execution.status,
    'succeeded',
    JSON.stringify(result.body.execution.error),
  );
  assert.equal(result.body.execution.result.approved, true);
  assert.equal(result.body.artifacts.length, 2);
  const report = aiExecutionDiagnosticsResponseSchema.parse(
    (await client.get(`/api/admin/operations/agents/executions/${id}/diagnostics`).expect(200))
      .body,
  );
  assert.equal(report.model_calls.length, 3);
  assert(report.model_calls.every((call) => call.status === 'succeeded'));
  for (const [stepId, agentId] of [
    ['draft', 'planner'],
    ['clarity', 'editor'],
    ['risk', 'reviewer'],
  ]) {
    const step = report.events.find(
      (event) => event.type === 'step.started' && event.data.step_id === stepId,
    );
    assert(step);
    const call = report.model_calls.find((item) => item.diagnostics.agent_id === agentId);
    assert.deepEqual(call?.diagnostics.step, { id: stepId, start_seq: step.seq });
  }
  assert(report.traces.length > 0);
  assert.equal(report.interactions[0].responded_by, hub.admin.id);
  assert(report.events.some((event) => event.type === 'message.delta'));
  assert.equal(report.events.at(-1)?.type, 'execution.completed');
  assert.deepEqual(report.artifacts, result.body.artifacts);
  assert.equal(provider.requests.length, 3);
});

for (const format of ['openai', 'anthropic'] as const)
  for (const mode of ['rate-limit', 'truncated'] as const) {
    test(`AI ${format} ${mode} 被分类为失败且隐藏重试不能增加请求`, async (t) => {
      const provider = await providerFixture(format, mode);
      t.after(() => provider.close());
      const prior = process.env.AI_FIXTURE_KEY;
      process.env.AI_FIXTURE_KEY = 'ai-fixture-key';
      t.after(() => {
        if (prior === undefined) delete process.env.AI_FIXTURE_KEY;
        else process.env.AI_FIXTURE_KEY = prior;
      });
      const hub = await createTestHub(t, { ai: config(provider.url, format) });
      const row = await hub.hub.ai.runtime.submit(hub.admin.id, 'assistant', { prompt: 'test' });
      await hub.worker.tick();
      await hub.worker.waitForIdle();
      const result = await hub.hub.ai.runtime.get(row.id);
      assert.equal(result.status, 'failed');
      assert.equal(
        result.payload.error?.code,
        mode === 'rate-limit' ? 'AI_PROVIDER_FAILED' : 'AI_STREAM_INCOMPLETE',
      );
      assert.equal(provider.requests.length, 1);
      assert.equal(result.payload.usage.unknown_requests, 1);
    });
  }

test('AI 第一个文本增量在模型完成前提交；取消后旧执行者不能再写回', async (t) => {
  const provider = await providerFixture('openai', 'text', true);
  t.after(() => provider.close());
  const prior = process.env.AI_FIXTURE_KEY;
  process.env.AI_FIXTURE_KEY = 'ai-fixture-key';
  t.after(() => {
    if (prior === undefined) delete process.env.AI_FIXTURE_KEY;
    else process.env.AI_FIXTURE_KEY = prior;
  });
  const hub = await createTestHub(t, { ai: config(provider.url) });
  const runtime = hub.hub.ai.runtime;
  const textCommitted = deferred();
  const insert = runtime.store.insert.bind(runtime.store);
  t.mock.method(
    runtime.store,
    'insert',
    async <K extends AiTable>(table: K, row: AiRecordMap[K]) => {
      const result = await insert(table, row);
      if (table === 'ai_events' && 'type' in row.payload && row.payload.type === 'message.delta')
        textCommitted.resolve();
      return result;
    },
  );
  const row = await runtime.submit(hub.admin.id, 'assistant', { prompt: 'test' });
  await hub.worker.tick();
  await textCommitted.promise;
  assert.equal(provider.completed, false);
  const current = await runtime.get(row.id);
  assert(current.payload.message_text.length > 0);
  await runtime.cancel(row.id, hub.admin.id, current.payload.revision);
  provider.release.resolve();
  await hub.worker.waitForIdle();
  const cancelled = await runtime.get(row.id);
  assert.equal(cancelled.status, 'cancelled');
  assert.equal(cancelled.payload.result, null);
  const events = await runtime.store.list('ai_events', { execution_id: row.id, limit: 100 });
  assert.equal(events.at(-1)?.payload.type, 'execution.cancelled');
});

test('AI 权限在读取和执行时重新校验，队列中的执行撤权后不会调用模型', async (t) => {
  const provider = await providerFixture('openai', 'text');
  t.after(() => provider.close());
  const hub = await createTestHub(t, { ai: config(provider.url) });
  const owner = await signIn(hub);
  const reader = await signIn(hub, 'reader');
  await reader.get('/api/admin/operations/agents/catalog').expect(403);
  await reader.get('/api/ai/model-options').expect(403);
  assert.equal((await owner.get('/api/me').expect(200)).body.capabilities.can_ai_console, true);
  await owner.get('/api/admin/operations/agents/catalog').expect(200);
  const submit = () =>
    owner
      .post('/api/ai/executions')
      .set('Idempotency-Key', 'revoke')
      .send({ operation_id: 'assistant', input: { prompt: 'test' } });
  const result = await submit().expect(201);
  await reader.get(`/api/ai/executions/${String(result.body.id)}`).expect(403);
  const role = await hub.store.find('roles', 'key', 'admin');
  assert(role);
  await hub.store.put('roles', {
    ...role,
    permissions: role.permissions.filter((permission) => permission !== 'ai:inspect'),
  });
  await submit().expect(403);
  await owner.get(`/api/ai/executions/${String(result.body.id)}`).expect(403);
  await owner.get(`/api/ai/executions/${String(result.body.id)}/events`).expect(403);
  await hub.worker.tick();
  await hub.worker.waitForIdle();
  const row = await hub.hub.ai.runtime.get(String(result.body.id));
  assert.equal(row.status, 'failed');
  assert.equal(row.payload.error?.code, 'AI_FORBIDDEN');
  assert.equal(provider.requests.length, 0);
});

test('平台维护者不能发起平台级 Agent 任务，平台检查授权只开放读取', async (t) => {
  const hub = await createTestHub(t, { ai: config() });
  const maintainerRole = await hub.store.find('roles', 'key', 'maintainer');
  assert(maintainerRole);
  const {
    hub: { administration },
    admin,
    reader,
  } = hub;
  const grant = await administration.grantRole(admin, {
    principal_id: reader.id,
    role_id: maintainerRole.id,
    scope_type: 'platform',
    scope_id: '',
  });
  const inspect = await administration.createRole(admin, {
    name: 'AI 检查',
    permissions: ['ai:inspect'],
  });
  await administration.grantRole(admin, {
    principal_id: reader.id,
    role_id: inspect.id,
    scope_type: 'team',
    scope_id: hub.teamId,
  });
  const client = await signIn(hub, reader.username);
  const capabilities = () => client.get('/api/me').expect(200);
  assert.equal((await capabilities()).body.capabilities.can_ai_console, false);
  await client.get('/api/admin/operations/agents/catalog').expect(403);
  await client
    .get('/api/admin/operations/agents/executions')
    .query({ operation_id: 'resource-audit' })
    .expect(403);
  const submit = (operation_id: string, input: Record<string, string>) =>
    client
      .post('/api/ai/executions')
      .set('Idempotency-Key', operation_id)
      .send({ operation_id, input });
  await submit('assistant', { prompt: 'test' }).expect(403);
  await submit('agent-lab', { topic: 'test' }).expect(403);

  await administration.removeGrant(admin, 'role_bindings', grant.id);
  await administration.grantRole(admin, {
    principal_id: reader.id,
    role_id: inspect.id,
    scope_type: 'platform',
    scope_id: '',
  });
  const { can_ai, can_ai_console } = (await capabilities()).body.capabilities;
  assert.equal(can_ai, false);
  assert.equal(can_ai_console, true);
  await client.get('/api/admin/operations/agents/catalog').expect(200);
  await client.get('/api/admin/operations/agents/executions').expect(200);
  const row = await hub.hub.ai.runtime.submit(admin.id, 'assistant', { prompt: 'test' });
  await client.get(`/api/ai/executions/${row.id}`).expect(200);
  await submit('assistant', { prompt: 'test' }).expect(403);
});

test('平台审计权可读运营汇总，不能用来读取 Agent 目录、跨用户检索或诊断', async (t) => {
  const f = await createTestHub(t);
  const role = await f.hub.administration.createRole(f.admin, {
    name: '运营审计',
    permissions: ['audit:read'],
  });
  await f.hub.administration.grantRole(f.admin, {
    principal_id: f.reader.id,
    role_id: role.id,
    scope_type: 'platform',
    scope_id: '',
  });
  const auditor = await signIn(f, f.reader.username);
  await auditor.get('/api/admin/operations').expect(200);
  for (const path of [
    '/api/admin/operations/agents/catalog',
    '/api/admin/operations/agents/executions',
    '/api/admin/operations/agents/executions/run/diagnostics',
  ]) {
    const denied = await auditor.get(path).expect(403);
    assert.equal(denied.body.error.code, 'AI_FORBIDDEN');
  }
});

test('AI 引用资源撤销后详情、列表与事件均不能继续披露派生内容', async (t) => {
  const provider = await providerFixture('openai', 'text');
  t.after(() => provider.close());
  const prior = process.env.AI_FIXTURE_KEY;
  process.env.AI_FIXTURE_KEY = 'ai-fixture-key';
  t.after(() => {
    if (prior === undefined) delete process.env.AI_FIXTURE_KEY;
    else process.env.AI_FIXTURE_KEY = prior;
  });
  const hub = await createTestHub(t, { ai: config(provider.url) });
  const publication = await publishSkill(hub);
  const client = await signIn(hub);
  const row = await hub.hub.ai.runtime.submit(hub.admin.id, 'assistant', {
    prompt: 'Summarize',
    skill_ref: `version:${publication.intake.version_id}/SKILL.md`,
  });
  await hub.worker.tick();
  await hub.worker.waitForIdle();
  await client.get(`/api/ai/executions/${row.id}`).expect(200);
  await hub.worker.tick();
  await hub.worker.waitForIdle();
  assert.equal((await hub.hub.ai.runtime.get(row.id)).status, 'succeeded');
  const before = await client.get('/api/admin/operations/agents/executions').expect(200);
  assert.equal(before.body.items.length, 2);
  const asset = await hub.store.get('assets', publication.intake.asset_id);
  assert(asset);
  await hub.store.put('assets', { ...asset, lifecycle: 'blocked' });
  await client.get(`/api/ai/executions/${row.id}`).expect(403);
  await client.get(`/api/ai/executions/${row.id}/events`).expect(403);
  const after = await client.get('/api/admin/operations/agents/executions').expect(200);
  assert.deepEqual(after.body.items, []);
});

test('AI 检查权限可以读取他人执行，但 HTTP 和框架取消均校验真实操作者', async (t) => {
  const hub = await createTestHub(t, { ai: config() });
  const adminRole = await hub.store.find('roles', 'key', 'admin');
  assert(adminRole);
  await hub.hub.administration.grantRole(hub.admin, {
    principal_id: hub.reviewer.id,
    role_id: adminRole.id,
    scope_type: 'platform',
    scope_id: '',
  });
  const inspector = await signIn(hub, 'reviewer');
  const runtime = hub.hub.ai.runtime;
  const row = await runtime.submit(hub.admin.id, 'assistant', { prompt: 'test' });
  await inspector.get(`/api/ai/executions/${row.id}`).expect(200);
  await inspector
    .post(`/api/ai/executions/${row.id}/cancel`)
    .set('If-Match', `"${row.payload.revision}"`)
    .set('Idempotency-Key', 'foreign-cancel')
    .send({})
    .expect(404);
  await assert.rejects(() => runtime.cancel(row.id, hub.reviewer.id, row.payload.revision), {
    code: 'AI_FORBIDDEN',
  });
  assert.equal((await runtime.get(row.id)).status, 'queued');
  await runtime.cancel(row.id, hub.admin.id, row.payload.revision);
  assert.equal((await runtime.get(row.id)).status, 'cancelled');
});

test('AI 调度检查失败时停机仍中断活跃模型并等待收敛', { timeout: 20000 }, async (t) => {
  const provider = await providerFixture('openai', 'text', true);
  t.after(() => provider.close());
  const prior = process.env.AI_FIXTURE_KEY;
  process.env.AI_FIXTURE_KEY = 'ai-fixture-key';
  t.after(() => {
    if (prior === undefined) delete process.env.AI_FIXTURE_KEY;
    else process.env.AI_FIXTURE_KEY = prior;
  });
  const hub = await createTestHub(t, { ai: config(provider.url) });
  const runtime = hub.hub.ai.runtime;
  const row = await runtime.submit(hub.admin.id, 'assistant', { prompt: 'hello' });
  await hub.worker.tick();
  await provider.firstDelta.promise;
  const checking = deferred();
  const release = deferred();
  t.after(() => release.resolve());
  t.mock.method(runtime, 'expireWaiting', async () => {
    checking.resolve();
    await release.promise;
    throw new Error('Scheduler unavailable');
  });
  const ticking = assert.rejects(hub.worker.tick(), /Scheduler unavailable/);
  await checking.promise;
  const stopping = hub.worker.stop();
  release.resolve();
  await assert.rejects(stopping, AggregateError);
  await ticking;
  await provider.disconnected.promise;
  assert.equal((await runtime.get(row.id)).status, 'queued');
  assert.equal(hub.worker.busy, false);
});
