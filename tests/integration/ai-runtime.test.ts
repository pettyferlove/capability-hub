import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test, type TestContext } from 'node:test';
import {
  aiConfigurationSchema,
  AiRuntime,
  OperationRegistry,
  OutputRejectedError,
  ShortModelError,
} from '@capability-hub/ai';
import { createStep, createWorkflow } from '@capability-hub/ai/mastra';
import { createAiStore, HubAiQueue, purgeAiExchanges } from '@capability-hub/infrastructure/ai';
import { snapshotStore } from '@capability-hub/infrastructure/store';
import { z } from 'zod';
import { createTestHub, publishSkill, receiveSkill } from '../support/application.js';
import { fixture as providerFixture } from '../support/ai-provider.js';
import { signIn } from '../support/http.js';
import { deferred } from '../support/store.js';
import { serveModelStub, type StubHandler } from '../support/model-provider-stub.js';
import {
  aiCatalogResponseSchema,
  aiExecutionLedgerResponseSchema,
  aiExecutionDiagnosticsResponseSchema,
  aiExecutionViewResponseSchema,
  aiModelExchangeResponseSchema,
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
    for (const { body } of provider.requests) {
      assert.equal(body.reasoning_effort, format === 'openai' ? 'none' : undefined);
      assert.deepEqual(body.thinking, format === 'anthropic' ? { type: 'disabled' } : undefined);
      assert.equal(body.output_config, undefined);
    }
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
      assert.equal(observed.reasoning_effort, 'none');
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

for (const format of ['openai', 'anthropic'] as const)
  test(`AI ${format} HTTP 失败诊断导出上游标识，错误正文只随往返原文提供`, async (t) => {
    const detail = 'private-upstream-error-text';
    const chat = format === 'openai';
    const provider = await providerFixture(format, {
      status: 400,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'x-request-id': chat ? 'req-header' : 'ai-fixture-key',
      },
      body: JSON.stringify({
        error: {
          code: chat ? 'missing_session' : 'ai-fixture-key',
          type: 'invalid_request_error',
          message: `${detail}: ai-fixture-key\nAuthorization: Bearer synthetic-header-value`,
          headers: { 'x-custom': 'synthetic-envelope-extension' },
        },
        request_id: 'req-envelope',
      }),
    });
    t.after(provider.close);
    const prior = process.env.AI_FIXTURE_KEY;
    process.env.AI_FIXTURE_KEY = 'ai-fixture-key';
    t.after(() => {
      if (prior === undefined) delete process.env.AI_FIXTURE_KEY;
      else process.env.AI_FIXTURE_KEY = prior;
    });
    const hub = await createTestHub(t, { ai: config(provider.url, format) });
    const client = await signIn(hub);
    const row = await hub.hub.ai.runtime.submit(hub.admin.id, 'assistant', { prompt: 'Hello' });
    await hub.worker.tick();
    await hub.worker.waitForIdle();
    const path = `/api/admin/operations/agents/executions/${row.id}/diagnostics`;
    const response = await client.get(path).expect(200);
    const report = aiExecutionDiagnosticsResponseSchema.parse(response.body);
    const [call] = report.model_calls;
    const code = chat ? 'missing_session' : 'invalid_request_error';
    const requestId = chat ? 'req-header' : 'req-envelope';
    assert.equal(call.status, 'failed');
    assert.equal(call.error_code, 'AI_PROVIDER_FAILED');
    assert.equal(call.diagnostics.transport?.http_status, 400);
    assert.equal(call.diagnostics.transport?.upstream_error_code, code);
    assert.equal(call.diagnostics.transport?.upstream_request_id, requestId);
    assert.equal(call.exchange, 'available');
    assert(!response.text.includes(detail));
    const exchange = await client
      .get(`/api/admin/operations/agents/executions/${row.id}/calls/${call.id}/exchange`)
      .expect(200);
    const { response: reply } = aiModelExchangeResponseSchema.parse(exchange.body);
    assert(reply?.error_body?.includes(detail));
    const markdown = await client.get(path + '?download=markdown').expect(200);
    assert(markdown.text.includes(`"upstream_error_code": "${code}"`));
    assert(markdown.text.includes(`"upstream_request_id": "${requestId}"`));
    assert(markdown.text.includes(detail));
    const json = await client.get(path + '?download=json').expect(200);
    for (const evidence of [response, exchange, markdown, json]) {
      for (const secret of [
        'ai-fixture-key',
        'synthetic-header-value',
        'synthetic-envelope-extension',
      ])
        assert(!evidence.text.includes(secret));
    }
  });

test('队列收到非 SSE 的 200 时保留脱敏有界样本，不当作断流或确认用量', async (t) => {
  const stub = await serveModelStub(t);
  const sample = `gateway: ${stub.credential}\nx-api-key: synthetic-gateway-value\n`;
  stub.setHandler(() => ({
    headers: { 'content-type': 'text/html' },
    body: sample + '界'.repeat(4000),
  }));
  const ai = config(stub.origin);
  ai.profiles[0].credential_ref = stub.credentialRef;
  const hub = await createTestHub(t, { ai });
  const row = await hub.hub.ai.runtime.submit(hub.admin.id, 'assistant', { prompt: 'Hello' });
  await hub.worker.tick();
  await hub.worker.waitForIdle();
  const runtime = hub.hub.ai.runtime;
  assert.equal((await runtime.get(row.id)).payload.usage.unknown_requests, 1);
  const [call] = await runtime.store.list('ai_calls', { execution_id: row.id, limit: 1 });
  assert.equal(call.payload.error_code, 'AI_PROVIDER_FAILED');
  const client = await signIn(hub);
  const report = aiExecutionDiagnosticsResponseSchema.parse(
    (await client.get(`/api/admin/operations/agents/executions/${row.id}/diagnostics`).expect(200))
      .body,
  );
  assert.equal(report.model_calls[0].failure_reason, undefined);
  const exchange = await client
    .get(`/api/admin/operations/agents/executions/${row.id}/calls/${call.id}/exchange`)
    .expect(200);
  const reply = aiModelExchangeResponseSchema.parse(exchange.body).response;
  assert(reply && typeof reply.raw === 'string');
  assert(reply.raw.startsWith('gateway: *'));
  assert(reply.raw.includes('界'));
  assert(Buffer.byteLength(reply.raw) <= 8192);
  assert.equal(reply.truncated, true);
  assert(!exchange.text.includes(stub.credential));
  assert(!exchange.text.includes('synthetic-gateway-value'));
});

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
  const manual = aiCatalogResponseSchema.parse(
    (await owner.get('/api/admin/operations/agents/catalog').expect(200)).body,
  );
  assert(manual.operations.some((operation) => operation.id === 'assistant'));
  assert(manual.operations.every((operation) => !('execution_mode' in operation)));
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
  const catalogPath = '/api/admin/operations/agents/catalog';
  assert.deepEqual((await client.get(catalogPath).expect(200)).body.operations, []);
  const catalog = aiCatalogResponseSchema.parse(
    (await client.get(catalogPath).query({ view: 'registered' }).expect(200)).body,
  );
  assert(catalog.operations.every((item) => item.execution_mode === 'inline'));
  for (const id of ['catalog-discovery', 'catalog-prompts', 'resource-evaluation'])
    assert(catalog.operations.some((item) => item.id === id));
  await client.get('/api/admin/operations/agents/executions').expect(200);
  const row = await hub.hub.ai.runtime.submit(admin.id, 'assistant', { prompt: 'test' });
  await client.get(`/api/ai/executions/${row.id}`).expect(200);
  await submit('assistant', { prompt: 'test' }).expect(403);
});

test('自动 Agent 不能手动提交，本人也只能凭平台检查权查看、不能取消或应答', async (t) => {
  const stub = await serveModelStub(t);
  const profile = stub.profile('openai');
  const f = await createTestHub(t, {
    ai: aiConfigurationSchema.parse({ profiles: [profile], default_profile: profile.id }),
  });
  const admin = await signIn(f);
  const reviewer = await signIn(f, f.reviewer.username);
  const ledger = '/api/admin/operations/agents/executions';
  for (const operation_id of ['catalog-discovery', 'catalog-prompts', 'resource-evaluation'])
    await admin
      .post('/api/ai/executions')
      .set('Idempotency-Key', operation_id)
      .send({ operation_id, input: {} })
      .expect(403);
  assert.deepEqual((await admin.get(ledger).expect(200)).body.items, []);

  await f.hub.ai.runtime.runInline(
    {
      operationId: 'catalog-discovery',
      ownerId: f.reviewer.id,
      profileId: profile.id,
      signal: new AbortController().signal,
    },
    (run) =>
      run.call('turn', {
        operation: 'catalog-discovery/turn',
        instructions: '返回空对象',
        input: '{}',
        schema: z.strictObject({}),
      }),
  );
  const { items } = aiExecutionLedgerResponseSchema.parse(
    (await admin.get(ledger).query({ view: 'summary', q: '首页对话检索' }).expect(200)).body,
  );
  assert.equal(items.length, 1);
  const [item] = items;
  assert.equal(item.owner_display_name, f.reviewer.display_name);
  const path = '/api/ai/executions/' + item.id;
  await reviewer.get(path).expect(403);
  await reviewer.get(path + '/events').expect(403);
  await reviewer.get(`${ledger}/${item.id}/diagnostics`).expect(403);

  const inspect = await f.hub.administration.createRole(f.admin, {
    name: '平台运行检查',
    permissions: ['ai:inspect'],
  });
  await f.hub.administration.grantRole(f.admin, {
    principal_id: f.reviewer.id,
    role_id: inspect.id,
    scope_type: 'platform',
    scope_id: '',
  });
  const { execution } = aiExecutionViewResponseSchema.parse(
    (await reviewer.get(path).expect(200)).body,
  );
  assert.equal(execution.execution_mode, 'inline');
  for (const [action, body] of [
    ['cancel', {}],
    ['interactions/approval/respond', { response: {} }],
  ] as const)
    await reviewer
      .post(`${path}/${action}`)
      .set('If-Match', `"${execution.revision}"`)
      .set('Idempotency-Key', 'inline-write')
      .send(body)
      .expect(403);
  assert.equal((await reviewer.get(path).expect(200)).body.execution.revision, execution.revision);
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
  const hub = await createTestHub(t, { ai: config(provider.url), evaluationDailyRequests: 0 });
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
  t.mock.method(runtime, 'expireDueExecutions', async () => {
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

async function inlineHub(t: TestContext, reply?: StubHandler) {
  const stub = await serveModelStub(t, reply);
  const profile = stub.profile('openai');
  const f = await createTestHub(t, {
    ai: aiConfigurationSchema.parse({ profiles: [profile], default_profile: profile.id }),
  });
  const options = {
    operationId: 'resource-evaluation',
    ownerId: 'system',
    profileId: profile.id,
    signal: new AbortController().signal,
  };
  return { f, options };
}

for (const reason of ['cancelled', 'execution_timeout'] as const)
  test(`诊断保留宿主的 ${reason} 原因，不误报网络或单请求超时`, async (t) => {
    const dispatched = deferred();
    const { f, options } = await inlineHub(t, () => {
      dispatched.resolve();
      return { hang: true };
    });
    const controller = new AbortController();
    const runtime = f.hub.ai.runtime;
    const running = runtime.runInline({ ...options, signal: controller.signal }, (run) =>
      run.call('check', {
        operation: 'resource-evaluation/check',
        input: '{}',
        instructions: '返回空对象',
        schema: z.strictObject({}),
      }),
    );
    const ended = assert.rejects(running, ShortModelError);
    await dispatched.promise;
    controller.abort(
      reason === 'execution_timeout' ? new DOMException('', 'TimeoutError') : undefined,
    );
    await ended;
    const [row] = await runtime.store.list('ai_executions', {
      lookup_key: options.operationId,
      limit: 1,
    });
    const client = await signIn(f);
    const path = `/api/admin/operations/agents/executions/${row.id}/diagnostics`;
    const report = aiExecutionDiagnosticsResponseSchema.parse(
      (await client.get(path).expect(200)).body,
    );
    assert.equal(report.execution.status, reason === 'cancelled' ? 'cancelled' : 'timed_out');
    assert.equal(report.model_calls[0].failure_reason, reason);
    assert.equal(report.model_calls[0].diagnostics.transport?.request_timed_out, false);
  });

test('内联调用记录字段与业务规则拒绝，往返原文只交给能读取所引版本的检查者', async (t) => {
  const { f, options } = await inlineHub(t, (_request, index) => ({
    json: {
      id: 'chatcmpl-stub',
      object: 'chat.completion',
      created: 1,
      model: 'stub-model',
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: JSON.stringify({ verdict: index === 0 ? 7 : 'ok' }),
            reasoning_content: 'private-reasoning',
          },
          finish_reason: 'stop',
        },
      ],
      usage: {
        prompt_tokens: 11,
        completion_tokens: 7,
        total_tokens: 18,
        completion_tokens_details: { reasoning_tokens: 5 },
      },
    },
  }));
  const { intake } = await publishSkill(f);
  const runtime = f.hub.ai.runtime;
  const request = {
    operation: 'resource-evaluation/check',
    instructions: 'private-instructions',
    input: 'private-input',
    schema: z.strictObject({ verdict: z.string() }),
  };
  await assert.rejects(
    runtime.runInline(options, (run) =>
      run.call('check', { ...request, subject: intake.version_id }),
    ),
    (error) => error instanceof ShortModelError && error.reason === 'invalid_output',
  );
  await assert.rejects(
    runtime.runInline(options, (run) =>
      run.call('rule', {
        ...request,
        resources: ['unreadable-version'],
        accept: () => {
          throw new OutputRejectedError('verdict-rule', '结论不在允许范围', {
            expected: 1,
            actual: 0,
          });
        },
      }),
    ),
    OutputRejectedError,
  );
  const [schemaRun, ruleRun] = await runtime.store.list('ai_executions', {
    lookup_key: 'resource-evaluation',
    limit: 10,
  });
  assert.equal(schemaRun.payload.error?.message, '模型回答的字段或类型不符合约定');
  assert.equal(ruleRun.payload.error?.message, '结论不在允许范围');
  const [schemaCall] = await runtime.store.list('ai_calls', {
    execution_id: schemaRun.id,
    limit: 10,
  });
  assert.equal(schemaCall.status, 'succeeded');
  assert.equal(schemaCall.payload.diagnostics.transport?.reasoning_tokens, 5);
  assert.deepEqual(schemaCall.payload.output_check, {
    status: 'rejected',
    reason: 'schema_mismatch',
    issues: [{ path: 'verdict', code: 'invalid_type', expected: 'string' }],
  });
  const [ruleCall] = await runtime.store.list('ai_calls', { execution_id: ruleRun.id, limit: 10 });
  assert.deepEqual(ruleCall.payload.output_check, {
    status: 'rejected',
    reason: 'host_rejected',
    message: '结论不在允许范围',
    rule: 'verdict-rule',
    facts: { expected: 1, actual: 0 },
  });
  const ruleEvents = await runtime.store.list('ai_events', { execution_id: ruleRun.id, limit: 20 });
  assert.deepEqual(
    ruleEvents.map((event) => event.payload.type).filter((type) => type.startsWith('step.')),
    ['step.started', 'step.failed'],
  );
  assert(
    !JSON.stringify([schemaRun, ruleRun, schemaCall, ruleCall, ruleEvents]).includes('private-'),
  );

  const inspect = await f.hub.administration.createRole(f.admin, {
    name: '平台运行检查',
    permissions: ['ai:inspect'],
  });
  await f.hub.administration.grantRole(f.admin, {
    principal_id: f.reviewer.id,
    role_id: inspect.id,
    scope_type: 'platform',
    scope_id: '',
  });
  const inspector = await signIn(f, f.reviewer.username);
  const ledger = '/api/admin/operations/agents/executions';
  const schemaReport = aiExecutionDiagnosticsResponseSchema.parse(
    (await inspector.get(`${ledger}/${schemaRun.id}/diagnostics`).expect(200)).body,
  );
  assert.equal(schemaReport.model_calls[0].failure_reason, 'schema_mismatch');
  assert.equal(schemaReport.model_calls[0].exchange, 'available');
  assert(!JSON.stringify(schemaReport).includes('private-'));
  const exchange = aiModelExchangeResponseSchema.parse(
    (await inspector.get(`${ledger}/${schemaRun.id}/calls/${schemaCall.id}/exchange`).expect(200))
      .body,
  );
  assert.deepEqual(exchange.resource_refs, [intake.version_id]);
  assert.match(JSON.stringify(exchange.request.body), /private-instructions[\s\S]*private-input/);
  assert.equal(exchange.response?.text, '{"verdict":7}');
  assert.equal(exchange.response?.reasoning, 'private-reasoning');
  const ruleReport = aiExecutionDiagnosticsResponseSchema.parse(
    (await inspector.get(`${ledger}/${ruleRun.id}/diagnostics?download=json`).expect(200)).body,
  );
  assert.equal(ruleReport.model_calls[0].failure_reason, 'host_rejected');
  assert.equal(ruleReport.model_calls[0].exchange, 'withheld');
  assert.deepEqual(ruleReport.exchanges, []);
  await inspector.get(`${ledger}/${ruleRun.id}/calls/${ruleCall.id}/exchange`).expect(403);
});

test('往返原文随未发布版本删除、按保留期清理，且不进入备份', async (t) => {
  const { f, options } = await inlineHub(t);
  const candidate = await receiveSkill(f);
  const runtime = f.hub.ai.runtime;
  const call = (subject?: string) =>
    runtime.runInline(options, (run) =>
      run.call('check', {
        operation: 'resource-evaluation/check',
        instructions: '返回空对象',
        input: '{}',
        schema: z.strictObject({}),
        ...(subject && { subject }),
      }),
    );
  await call(candidate.version_id);
  await call();
  assert.equal((await runtime.store.list('ai_exchanges', { limit: 10 })).length, 2);
  assert(!('ai_exchanges' in (await snapshotStore(f.store))));
  const asset = await f.hub.assetAccess.getAsset(candidate.asset_id);
  await f.hub.lifecycle.deleteAsset(
    f.admin,
    asset.id,
    { reason: '放弃发布' },
    `"${asset.revision}"`,
    randomUUID(),
  );
  const [kept] = await runtime.store.list('ai_exchanges', { limit: 10 });
  assert.equal(kept.lookup_key, '');
  const day = 86_400_000;
  assert.equal(await purgeAiExchanges(f.store, 30, Date.now() + 29 * day), 0);
  assert.equal(await purgeAiExchanges(f.store, 30, Date.now() + 31 * day), 1);
  assert.deepEqual(await runtime.store.list('ai_exchanges', { limit: 10 }), []);
});
