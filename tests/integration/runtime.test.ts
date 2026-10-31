import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '@capability-hub/server';
import { loadServerConfig } from '@capability-hub/server/config';

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
