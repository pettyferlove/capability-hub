import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createApp } from '@capability-hub/server';
import { loadServerConfig } from '@capability-hub/server/config';
import type { OperationsResponse } from '@capability-hub/contracts/http';
import type { ExecutionRecord } from '@capability-hub/ai';
import { createTestHub } from '../support/application.js';
import { frameworkConfig } from '../support/ai-framework.js';
import { httpClient, signIn } from '../support/http.js';
import { assertProjectTokenUsage } from '../support/token-usage.js';
import { assertResourceActivity } from '../support/resource-activity.js';

const operationsPath = '/api/admin/operations';

test('有效页面返回入口，浏览器打开未知地址得到 404 入口，接口与资源请求保持 JSON 404', async (context) => {
  const directory = await mkdtemp(join(tmpdir(), 'hub-operations-web-'));
  context.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(join(directory, 'index.html'), '<!doctype html><title>Hub</title>');
  const f = await createTestHub(context, { webDirectory: directory });
  const client = httpClient(f);
  for (const path of [
    '/operations',
    '/operations?tab=agents&execution=run',
    '/operations?tab=usage',
    '/account',
    '/account/?tab=security',
    '/account?tab=roles',
    '/asset/skill?tab=feedback',
  ])
    await client
      .get(path)
      .set('Accept', 'text/html')
      .expect(200, /<title>Hub<\/title>/);
  for (const path of [
    '/account?tab=unknown',
    '/account?tab=profile&tab=roles',
    '/operations?tab=unknown',
    '/operations?tab=agents&tab=usage',
    '/operations-missing',
  ])
    await client
      .get(path)
      .set('Accept', 'text/html,application/xhtml+xml,*/*;q=0.8')
      .expect(404, /<title>Hub<\/title>/);
  for (const [path, accept] of [
    ['/operations-missing', 'application/json'],
    ['/operations-missing', '*/*'],
    ['/health/missing', 'text/html'],
    ['/assets/missing.js', '*/*'],
  ]) {
    const response = await client.get(path).set('Accept', accept).expect(404);
    assert.equal(response.body.error.code, 'NOT_FOUND');
  }
});

test('运营总览按发布、分发和反馈提交日计数，只向平台审计员提供汇总', async (context) => {
  const f = await createTestHub(context);
  const path = '/api/admin/resource-activity';
  await httpClient(f).get(path).expect(401);
  await (await signIn(f)).get(path).query({ days: '90' }).expect(422);
  await assertResourceActivity(context, f);
  const inspect = await f.hub.administration.createRole(f.admin, {
    name: '流程检查',
    permissions: ['ai:inspect'],
  });
  await f.hub.administration.grantRole(f.admin, {
    principal_id: f.reader.id,
    role_id: inspect.id,
    scope_type: 'platform',
    scope_id: '',
  });
  await (await signIn(f, f.reader.username)).get(path).expect(403);
});

test('项目 Token 用量按模型调用汇总，时间和归属不随执行创建日变化', async (context) => {
  context.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-11-02T06:30:00.000Z') });
  await assertProjectTokenUsage(await createTestHub(context, { ai: frameworkConfig() }));
});

test('全项目 Token 统计需要平台审计权限，空数据与采样失败有不同响应', async (context) => {
  const f = await createTestHub(context);
  const path = '/api/admin/token-usage';
  await httpClient(f).get(path).expect(401);
  const inspect = await f.hub.administration.createRole(f.admin, {
    name: 'AI 检查',
    permissions: ['ai:inspect'],
  });
  await f.hub.administration.grantRole(f.admin, {
    principal_id: f.reader.id,
    role_id: inspect.id,
    scope_type: 'platform',
    scope_id: '',
  });
  const reader = await signIn(f, f.reader.username);
  await reader.get(path).expect(403);
  const admin = await signIn(f);
  await admin.get(path).query({ period: 'other' }).expect(422);
  const empty = await admin.get(path).expect(200);
  assert.equal(empty.body.totals.requests, 0);
  assert.deepEqual(empty.body.by_agent, []);
  context.mock.method(f.hub.ai.runtime.store, 'summarizeTokenUsage', async () => {
    throw new Error('private-sampling-error');
  });
  const failed = await admin.get(path).expect(500);
  assert.doesNotMatch(failed.text, /private-sampling-error/);
});

test('执行趋势按北京时间创建日分桶，包含零值日期并排除窗口外和未来的执行', async (context) => {
  const cutoff = '2026-11-01T16:00:00.000Z';
  context.mock.timers.enable({ apis: ['Date'], now: Date.parse(cutoff) });
  const fixture = await createTestHub(context, { ai: frameworkConfig() });
  const runtime = fixture.hub.ai.runtime;
  const template = await runtime.submit(fixture.admin.id, 'assistant', { prompt: '私有输入' });
  async function add(created_at: string, status: ExecutionRecord['status'], code?: string) {
    const id = randomUUID();
    await runtime.store.insert('ai_executions', {
      ...template,
      id,
      execution_id: id,
      created_at,
      updated_at: cutoff,
      position: Date.parse(created_at),
      status,
      payload: {
        ...template.payload,
        error: code ? { code, message: '私有错误原文', retryable: false } : null,
      },
    });
  }
  await add('2026-10-03T15:59:59.999Z', 'succeeded');
  await add('2026-10-03T16:00:00.000Z', 'waiting_input');
  await add('2026-10-31T15:59:59.999Z', 'failed', 'AI_OUTPUT_INVALID');
  await add('2026-10-31T14:00:00.000Z', 'failed', 'AI_OUTPUT_INVALID');
  await add('2026-10-31T16:00:00.000Z', 'timed_out', 'AI_PRIVATE_DIAGNOSTICS');
  await add('2026-11-01T16:00:00.001Z', 'succeeded');
  const admin = await signIn(fixture);
  const response = await admin.get(operationsPath).expect(200);
  const days = (response.body as OperationsResponse).agents.daily_activity;
  assert(days && days.length === 30);
  const populated = days.filter((day) => day.counts.length);
  assert.deepEqual(
    populated.map((day) => day.date),
    ['2026-10-04', '2026-10-31', '2026-11-01', '2026-11-02'],
  );
  assert.deepEqual(
    populated.map((day) => day.counts),
    [
      [{ operation_id: 'assistant', status: 'waiting_input', count: 1, error_code: null }],
      [{ operation_id: 'assistant', status: 'failed', count: 2, error_code: 'AI_OUTPUT_INVALID' }],
      [{ operation_id: 'assistant', status: 'timed_out', count: 1, error_code: null }],
      [{ operation_id: 'assistant', status: 'queued', count: 1, error_code: null }],
    ],
  );
  assert(!response.text.includes('私有输入'));
  assert(!response.text.includes('私有错误原文'));
  assert(!response.text.includes('AI_PRIVATE_DIAGNOSTICS'));
});

test('运行快照按 Agent 汇总保留的执行，只向审计员披露统计与模型标识', async (context) => {
  const fixture = await createTestHub(context, { ai: frameworkConfig() });
  const { runtime } = fixture.hub.ai;
  const input = { prompt: '仅执行所有者可读的输入' };
  const first = await runtime.submit(fixture.admin.id, 'assistant', input);
  const queued = await runtime.submit(fixture.admin.id, 'assistant', input);
  await runtime.store.put('ai_executions', { ...queued, lookup_key: 'target-specific-key' });
  const cancelled = await runtime.cancel(first.id, fixture.admin.id, first.payload.revision);

  await httpClient(fixture).get(operationsPath).expect(401);
  const reader = await signIn(fixture, 'reader');
  await reader.get(operationsPath).expect(403);
  const admin = await signIn(fixture);
  const response = await admin.get(operationsPath).expect(200);
  const data = response.body as OperationsResponse;
  assert.equal(data.database.driver, 'sqlite');
  assert.equal(data.database.available, true);
  assert(data.database.size_bytes && data.database.size_bytes > 0);
  assert.equal(data.object_storage.driver, 'filesystem');
  assert.equal(data.object_storage.available, true);
  assert.equal(data.worker_state, 'stopped');
  assert.equal(data.agents.default_profile, 'fixture');
  assert.deepEqual(data.agents.profiles, [
    { id: 'fixture', label: 'Fixture', model: 'fixture-model', format: 'openai' },
  ]);
  assert.deepEqual(data.agents.operations.find((agent) => agent.id === 'assistant')?.activity, {
    by_status: { queued: 1, cancelled: 1 },
    last_activity_at: cancelled.updated_at,
  });
  assert.deepEqual(data.agents.operations.find((agent) => agent.id === 'agent-lab')?.activity, {
    by_status: {},
    last_activity_at: null,
  });
  for (const value of [
    input.prompt,
    first.id,
    fixture.admin.id,
    fixture.config.ai.profiles[0].base_url,
    fixture.config.ai.profiles[0].credential_ref,
  ])
    assert(!response.text.includes(value));
});

test('备份记录数区分没有成功备份、已有记录和审计读取失败', async (context) => {
  const fixture = await createTestHub(context);
  const admin = await signIn(fixture);
  const snapshot = async () =>
    (await admin.get(operationsPath).expect(200)).body as OperationsResponse;
  assert.equal((await snapshot()).backup_record_count, 0);
  await fixture.store.audit('system', 'backup.completed', 'instance');
  await fixture.store.audit('system', 'backup.completed', 'instance');
  assert.equal((await snapshot()).backup_record_count, 2);

  const where = fixture.store.where.bind(fixture.store);
  context.mock.method(fixture.store, 'where', (async (table, key, value) => {
    if (table === 'audit' && key === 'action' && value === 'backup.completed')
      throw new Error('备份审计暂不可读');
    return where(table, key, value);
  }) satisfies typeof fixture.store.where);
  assert.equal((await snapshot()).backup_record_count, undefined);
});

test('对象存储读写探测失败时，运行快照仍保留数据库、Agent 和队列信息', async (context) => {
  const fixture = await createTestHub(context);
  const client = await signIn(fixture);
  fixture.worker.start();
  await fixture.worker.waitForIdle();
  context.mock.method(fixture.blobs, 'health', async () => {
    throw new Error('private-storage-diagnostics');
  });
  const response = await client.get(operationsPath).expect(200);
  const data = response.body as OperationsResponse;
  assert.equal(data.object_storage.available, false);
  assert(data.object_storage.duration_ms >= 0);
  assert.equal(data.database.available, true);
  assert.notEqual(data.worker_state, 'stopped');
  assert.deepEqual(data.jobs?.by_state, {});
  assert.deepEqual(data.agents.profiles, []);
  assert(data.agents.operations.some((agent) => agent.id === 'resource-audit'));
  assert(!response.text.includes('private-storage-diagnostics'));
});

test('数据库统计无法采样时，快照区分无记录与不可用', async (context) => {
  const fixture = await createTestHub(context);
  const client = await signIn(fixture);
  const fail = async () => {
    throw new Error('private-database-diagnostics');
  };
  context.mock.method(fixture.store, 'health', fail);
  context.mock.method(fixture.store, 'sizeBytes', fail);
  const all = fixture.store.all.bind(fixture.store);
  context.mock.method(fixture.store, 'all', (table: Parameters<typeof all>[0]) =>
    table === 'jobs' ? fail() : all(table),
  );
  context.mock.method(fixture.hub.ai.runtime.store, 'summarizeExecutions', fail);
  context.mock.method(fixture.hub.ai.runtime.store, 'summarizeExecutionDays', fail);
  const response = await client.get(operationsPath).expect(200);
  const data = response.body as OperationsResponse;
  assert.equal(data.database.available, false);
  assert.equal(data.database.size_bytes, null);
  assert.equal(data.object_storage.available, true);
  assert.equal(data.jobs, null);
  assert.deepEqual(data.scans?.by_state, {});
  assert.equal(data.last_backup_at, null);
  assert(data.agents.operations.length > 0);
  assert(data.agents.operations.every((agent) => agent.activity === null));
  assert.equal(data.agents.daily_activity, null);
  assert(!response.text.includes('private-database-diagnostics'));
});

test('关闭保留 Worker 与存储的全部错误，仍释放其余资源且重复关闭复用同一任务', async (context) => {
  const directory = await mkdtemp(join(tmpdir(), 'hub-runtime-close-'));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const runtime = await createApp(
    loadServerConfig(
      { dataDir: directory, secret: 'ab'.repeat(32), worker: false, logLevel: 'silent' },
      {},
    ),
  );
  const stop = runtime.worker.stop.bind(runtime.worker);
  const closeStore = runtime.store.close.bind(runtime.store);
  const closeBlobs = runtime.blobs.close.bind(runtime.blobs);
  let blobsClosed = false;
  context.mock.method(runtime.worker, 'stop', async () => {
    await stop();
    throw new Error('worker cleanup failed');
  });
  context.mock.method(runtime.store, 'close', async () => {
    await closeStore();
    throw new Error('database cleanup failed');
  });
  context.mock.method(runtime.blobs, 'close', async () => {
    await closeBlobs();
    blobsClosed = true;
  });
  const closing = runtime.close();
  assert.equal(runtime.close(), closing);
  await assert.rejects(closing, (error: unknown) => {
    assert(error instanceof AggregateError);
    assert.equal(error.errors.length, 2);
    assert.match(error.errors[0].message, /worker cleanup failed/);
    assert(error.errors[1] instanceof AggregateError);
    assert.match(error.errors[1].errors[0].message, /database cleanup failed/);
    return true;
  });
  assert.equal(blobsClosed, true);
  await assert.rejects(() => runtime.store.all('users'), /Store is closing/);
});
