import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createLogger, LogContext } from '@capability-hub/logging/server';
import { createBrowserLogTransport } from '@capability-hub/logging/browser';
import type { BrowserLogBatch, BrowserLogEntry } from '@capability-hub/logging/events';
import { deferred } from '../support/store.js';

function logCapture() {
  const entries: Record<string, unknown>[] = [];
  const logger = createLogger({
    service: 'test',
    destination: {
      write(line: string) {
        const value: unknown = JSON.parse(line);
        assert(value && typeof value === 'object' && !Array.isArray(value));
        entries.push(value as Record<string, unknown>);
      },
    },
  });
  return { logger, entries };
}

test('根日志、子日志和后加绑定均脱敏，子日志更新不会写进根日志', () => {
  const { logger, entries } = logCapture();
  const child = logger.child({ account: 'child', token: 'child-secret' });
  child.setBindings({ tenant: 'child-only', password: 'binding-secret' });
  logger.info({
    event: 'root',
    endpoint: 'https://user:password@example.test/api?token=query-secret#fragment',
    credentials: { secret: 'nested-secret' },
  });
  child.info({ event: 'child', err: new Error('sensitive-message token=error-secret') });
  const serialized = JSON.stringify(entries);
  for (const secret of [
    'child-secret',
    'binding-secret',
    'query-secret',
    'nested-secret',
    'sensitive-message',
    'error-secret',
    'user:password',
  ])
    assert.equal(serialized.includes(secret), false, secret);
  assert.equal(entries[0].tenant, undefined);
  assert.equal(entries[1].tenant, 'child-only');
  assert.equal(entries[1].account, 'child');
});

test('异步请求上下文隔离交错执行，离开上下文后恢复根日志', async () => {
  const { logger, entries } = logCapture();
  const logs = new LogContext(logger);
  const first = deferred(),
    second = deferred();
  const a = logs.run({ request_id: 'first' }, async () => {
    first.resolve();
    await second.promise;
    logs.logger.info({ event: 'first.finished' });
  });
  await first.promise;
  const b = logs.run({ request_id: 'second' }, async () => {
    logs.logger.info({ event: 'second.finished' });
    second.resolve();
    await Promise.resolve();
  });
  await Promise.all([a, b]);
  logs.logger.info({ event: 'outside' });
  assert.equal(entries.find((entry) => entry.event === 'first.finished')?.request_id, 'first');
  assert.equal(entries.find((entry) => entry.event === 'second.finished')?.request_id, 'second');
  assert.equal(entries.find((entry) => entry.event === 'outside')?.request_id, undefined);
});

test('浏览器日志限流并合并正在发送的任务，收集器失败不重试，也不阻断下一批', async (context) => {
  let time = Date.now();
  context.mock.method(Date, 'now', () => time);
  const pending = deferred();
  const batches: BrowserLogBatch[] = [];
  let failures = 1;
  const transport = createBrowserLogTransport(async (batch) => {
    batches.push(batch);
    await pending.promise;
    if (failures-- > 0) throw new Error('collector unavailable');
  }, 'synthetic-session');
  const entry: BrowserLogEntry = {
    event: 'http.failed',
    level: 'warn',
    page: '/discover',
    time,
    code: 'TEST_FAILURE',
  };
  for (let index = 0; index < 40; index++) transport.enqueue(entry);
  const first = transport.flush();
  assert.equal(transport.flush(), first);
  pending.resolve();
  await first;
  await transport.flush();
  await transport.flush();
  await transport.flush();
  assert.deepEqual(
    batches.map((batch) => batch.entries.length),
    [10, 10, 10],
  );
  assert(batches.every((batch) => Buffer.byteLength(JSON.stringify(batch)) <= 30 * 1024));
  time += 60000;
  transport.enqueue(entry);
  await transport.flush();
  assert.equal(batches.length, 4);
});

test('HTTP 完成日志使用静态路由模板并保留请求关联，健康探测不产生日志', async () => {
  const { default: express } = await import('express');
  const { default: request } = await import('supertest');
  const { logger, entries } = logCapture();
  const logs = new LogContext(logger);
  const app = express();
  app.use(logs.http());
  app.get('/resources/:id', (_req, res) => {
    logs.logger.info({ event: 'handler' });
    res.json({ ok: true });
  });
  app.get('/health/ready', (_req, res) => res.json({ ok: true }));
  const response = await request(app)
    .get('/resources/private-identifier?token=secret')
    .set('Authorization', 'Bearer secret');
  assert.equal(response.status, 200);
  await request(app).get('/health/ready').expect(200);
  const completed = entries.filter((entry) => entry.event === 'http.request');
  assert.equal(completed.length, 1);
  assert.deepEqual(completed[0].req, { method: 'GET', route: '/resources/:id' });
  assert.equal(completed[0].request_id, response.headers['x-request-id']);
  assert.equal(
    entries.find((entry) => entry.event === 'handler')?.request_id,
    response.headers['x-request-id'],
  );
  assert.equal(JSON.stringify(entries).includes('private-identifier'), false);
  assert.equal(JSON.stringify(entries).includes('secret'), false);
});

test('响应已开始的内部异常终止连接，仍记录错误指标且日志不包含异常原文', async () => {
  const { default: express } = await import('express');
  const { default: request } = await import('supertest');
  const { registerErrorHandler } =
    await import('../../apps/server/src/http/middleware/error-handler.js');
  const { RequestMetrics } = await import('../../apps/server/src/observability/operations.js');
  const { logger, entries } = logCapture();
  const metrics = new RequestMetrics();
  const app = express();
  app.get('/stream', (_req, res, next) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.write('partial response');
    next(new Error('sensitive stream failure with password=fixture-secret'));
  });
  registerErrorHandler(app, metrics, new LogContext(logger));
  await assert.rejects(
    async () => {
      await request(app).get('/stream').timeout({ response: 1000, deadline: 2000 });
    },
    (error: unknown) => error instanceof Error && /aborted|socket hang up/.test(error.message),
  );
  assert.equal(metrics.snapshot().errors.INTERNAL_ERROR, 1);
  assert.equal(entries.filter((entry) => entry.event === 'http.error').length, 1);
  assert.equal(JSON.stringify(entries).includes('sensitive stream failure'), false);
  assert.equal(JSON.stringify(entries).includes('fixture-secret'), false);
});
