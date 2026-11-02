import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { JobQueue } from '@capability-hub/application';
import { openRecordStore } from '@capability-hub/infrastructure/store';
import { archive } from '@capability-hub/infrastructure/content';
import { HubError } from '@capability-hub/domain/errors';
import { createSqliteStore, deferred } from '../support/store.js';
import { createTestHub } from '../support/application.js';
import { skillDocument } from '../support/content.js';
import { frameworkConfig } from '../support/ai-framework.js';
import { fixture as providerFixture } from '../support/ai-provider.js';

test('两个连接争最后一个空位时，AI 与内容的有效租约合计不能超过配置', async (t) => {
  const { store, path } = await createSqliteStore(t);
  const other = await openRecordStore({ driver: 'sqlite', path });
  t.after(() => other.close());
  const queue = new JobQueue(store, 2);
  const competing = new JobQueue(other, 2);
  await queue.enqueue('intake', randomUUID(), {});
  for (const id of [randomUUID(), randomUUID()])
    await queue.enqueue('ai_execution', id, { execution_id: id });
  const content = await queue.claim('first', ['intake']);
  assert(content);
  const winners = await Promise.all([
    queue.claimBatch('first', { kinds: ['ai_execution'] }),
    competing.claimBatch('second', { kinds: ['ai_execution'] }),
  ]);
  const claimed = winners.flat();
  assert.equal(claimed.length, 1);
  await queue.withLease(content, (current) =>
    store.put('jobs', { ...current, state: 'succeeded', lease_until: 0 }),
  );
  assert.deepEqual(await queue.claimBatch('first', { activeIds: [content.id] }), []);
  const next = await competing.claim('second');
  assert(next);
  assert.notEqual(next.id, claimed[0].id);
  assert.equal(next.attempt, 1);
});

test('五个共享名额可混跑 AI 和扫描，第六项在一个扫描结束后补位', { timeout: 20000 }, async (t) => {
  const provider = await providerFixture('openai', 'text', true);
  t.after(provider.close);
  const previous = process.env.AI_FIXTURE_KEY;
  process.env.AI_FIXTURE_KEY = 'ai-fixture-key';
  t.after(() => {
    if (previous === undefined) delete process.env.AI_FIXTURE_KEY;
    else process.env.AI_FIXTURE_KEY = previous;
  });
  const f = await createTestHub(t, { ai: frameworkConfig(provider.url) });
  type Gate = ReturnType<typeof deferred<void>>;
  const holds = new Map<string, { entered: Gate; release: Gate }>();
  const read = f.blobs.read.bind(f.blobs);
  t.mock.method(f.blobs, 'read', async (ref: string) => {
    const hold = holds.get(ref);
    if (hold) {
      hold.entered.resolve();
      await hold.release.promise;
    }
    return read(ref);
  });
  async function upload(slug: string) {
    const bytes = await archive([
      { path: 'SKILL.md', bytes: skillDocument(slug), executable: false },
    ]);
    const receipt = await f.hub.intakes.receive(
      f.admin,
      bytes,
      'skill.zip',
      {
        target: 'new',
        kind: 'skill',
        slug,
        owner_group_id: f.teamId,
        version_label: '1.0.0',
      },
      randomUUID(),
    );
    const intake = await f.store.get('intakes', receipt.intake_id);
    assert(intake?.payload_ref);
    const hold = { entered: deferred(), release: deferred() };
    holds.set(intake.payload_ref, hold);
    return { ...hold, id: intake.id };
  }
  const scans = await Promise.all(['first-scan', 'second-scan', 'third-scan'].map(upload));
  const agents = await Promise.all(
    ['one', 'two'].map((prompt) => f.hub.ai.runtime.submit(f.admin.id, 'assistant', { prompt })),
  );
  try {
    f.worker.start();
    await Promise.all([provider.firstDelta.promise, ...scans.map((scan) => scan.entered.promise)]);
    const next = await upload('next-scan');
    const jobs = await f.store.all('jobs');
    const active = jobs.filter((job) => job.state === 'running');
    assert.equal(active.filter((job) => job.kind === 'intake').length, 3);
    assert.equal(active.filter((job) => job.kind === 'ai_execution').length, 2);
    assert.equal(jobs.find((job) => job.aggregate_id === next.id)?.state, 'queued');
    assert.equal(await f.hub.jobs.claim('other-worker'), undefined);
    scans[0].release.resolve();
    await next.entered.promise;
    assert.equal((await f.store.get('intakes', scans[0].id))?.state, 'ready');
    assert.equal((await f.store.all('jobs')).filter((job) => job.state === 'running').length, 5);
  } finally {
    const stopping = f.worker.stop();
    for (const hold of holds.values()) hold.release.resolve();
    try {
      await stopping;
    } finally {
      provider.release.resolve();
    }
  }
  for (const agent of agents) assert.equal((await f.hub.ai.runtime.get(agent.id)).status, 'queued');
  assert.equal(f.worker.busy, false);
});

test('租约过期后由另一个连接接管，旧执行者不能续约或提交任何业务结果', async (context) => {
  const { store, path } = await createSqliteStore(context);
  const other = await openRecordStore({ driver: 'sqlite', path });
  context.after(() => other.close());
  const queue = new JobQueue(store),
    competing = new JobQueue(other);
  let time = Date.now();
  context.mock.method(Date, 'now', () => time);
  const job = await queue.enqueue('intake', randomUUID(), {});
  const first = await queue.claim('worker-first');
  assert(first);
  assert.equal(await competing.claim('worker-second'), undefined);
  time = first.lease_until;
  const second = await competing.claim('worker-second');
  assert(second);
  assert.equal(second.id, job.id);
  assert.equal(second.lease_epoch, first.lease_epoch + 1);
  assert.equal(await queue.renew(first), false);
  await assert.rejects(
    () =>
      queue.withLease(first, () =>
        store.insert('groups', { id: randomUUID(), name: '失效执行者', active: true, revision: 1 }),
      ),
    (error: unknown) => error instanceof HubError && error.code === 'LEASE_LOST',
  );
  assert.deepEqual(await store.all('groups'), []);
  await competing.withLease(second, (current) =>
    other.put('jobs', {
      ...current,
      state: 'succeeded',
      finished_at: new Date().toISOString(),
      lease_until: 0,
    }),
  );
  assert.equal((await store.get('jobs', job.id))?.state, 'succeeded');
});

test('取消和关联业务状态共享事务，回调失败时整体回滚，成功后不再重复处理', async (context) => {
  const { store } = await createSqliteStore(context);
  const queue = new JobQueue(store);
  const queued = await queue.enqueue('intake', randomUUID(), {});
  await store.put('jobs', { ...queued, cancel_requested: true });
  await assert.rejects(
    () =>
      queue.cancelRequested(async () => {
        await store.insert('groups', {
          id: randomUUID(),
          name: '不应提交',
          active: true,
          revision: 1,
        });
        throw new Error('关联取消失败');
      }),
    /关联取消失败/,
  );
  assert.equal((await store.get('jobs', queued.id))?.state, 'queued');
  assert.deepEqual(await store.all('groups'), []);
  let cancelled = 0;
  await queue.cancelRequested(() => {
    cancelled++;
  });
  await queue.cancelRequested(() => {
    cancelled++;
  });
  assert.equal(cancelled, 1);
  assert.equal((await store.get('jobs', queued.id))?.state, 'cancelled');
});

test('Worker 合并重叠 tick，停止会等待当前扫描完成并阻止领取后续任务', async (context) => {
  const fixture = await createTestHub(context);
  const entered = deferred(),
    resume = deferred();
  const process = fixture.hub.intakeProcessor.process.bind(fixture.hub.intakeProcessor);
  context.mock.method(
    fixture.hub.intakeProcessor,
    'process',
    async (...args: Parameters<typeof process>) => {
      entered.resolve();
      await resume.promise;
      return process(...args);
    },
  );
  const bytes = await archive([{ path: 'SKILL.md', bytes: skillDocument(), executable: false }]);
  async function upload(slug: string) {
    return fixture.hub.intakes.receive(
      fixture.admin,
      bytes,
      'skill.zip',
      {
        target: 'new',
        kind: 'skill',
        slug,
        owner_group_id: fixture.teamId,
        version_label: '1.0.0',
      },
      randomUUID(),
    );
  }
  const receipt = await upload('sample-skill');
  const tick = fixture.worker.tick();
  await entered.promise;
  assert.equal(fixture.worker.tick(), tick);
  const stopping = fixture.worker.stop();
  let stopped = false;
  void stopping.then(() => {
    stopped = true;
  });
  await Promise.resolve();
  assert.equal(stopped, false);
  resume.resolve();
  await stopping;
  assert.equal((await fixture.store.get('intakes', receipt.intake_id))?.state, 'ready');
  const next = await upload('second-skill');
  await fixture.worker.tick();
  assert.equal((await fixture.store.get('intakes', next.intake_id))?.state, 'received');
});

test('扫描后持有内容写入时租约被接管，旧 Worker 不能覆盖新执行者的作业和接收状态', async (context) => {
  const fixture = await createTestHub(context);
  const entered = deferred(),
    release = deferred();
  const original = fixture.blobs.put.bind(fixture.blobs);
  let blocked = false;
  const bytes = await archive([{ path: 'SKILL.md', bytes: skillDocument(), executable: false }]);
  const receipt = await fixture.hub.intakes.receive(
    fixture.admin,
    bytes,
    'skill.zip',
    {
      target: 'new',
      kind: 'skill',
      slug: 'sample-skill',
      owner_group_id: fixture.teamId,
      version_label: '1.0.0',
    },
    randomUUID(),
  );
  context.mock.method(fixture.blobs, 'put', async (value: Buffer) => {
    if (!blocked) {
      blocked = true;
      entered.resolve();
      await release.promise;
    }
    return original(value);
  });
  const tick = fixture.worker.tick();
  await entered.promise;
  const first = (await fixture.store.all('jobs'))[0];
  context.mock.method(Date, 'now', () => first.lease_until);
  const replacement = await fixture.hub.jobs.claim('replacement-worker');
  assert(replacement);
  await fixture.hub.jobs.withLease(replacement, async () => {
    const intake = await fixture.store.get('intakes', receipt.intake_id);
    assert(intake);
    await fixture.store.put('intakes', { ...intake, phase: '新执行者已接管' });
  });
  release.resolve();
  await tick;
  assert.equal((await fixture.store.get('intakes', receipt.intake_id))?.phase, '新执行者已接管');
  assert.equal(
    (await fixture.store.get('jobs', replacement.id))?.lease_owner,
    'replacement-worker',
  );
  assert.equal((await fixture.store.get('jobs', replacement.id))?.state, 'running');
  assert.deepEqual(await fixture.store.all('versions'), []);
});

test('未知存储故障按可重试任务错误处理，不伪装成用户内容格式错误', async (context) => {
  const fixture = await createTestHub(context);
  const bytes = await archive([{ path: 'SKILL.md', bytes: skillDocument(), executable: false }]);
  const receipt = await fixture.hub.intakes.receive(
    fixture.admin,
    bytes,
    'skill.zip',
    {
      target: 'new',
      kind: 'skill',
      slug: 'sample-skill',
      owner_group_id: fixture.teamId,
      version_label: '1.0.0',
    },
    randomUUID(),
  );
  context.mock.method(fixture.blobs, 'read', () =>
    Promise.reject(new Error('temporary filesystem failure')),
  );
  await fixture.worker.tick();
  const [job] = await fixture.store.all('jobs');
  assert.equal(job.state, 'queued');
  assert.equal(job.last_error_code, 'JOB_PROCESSING_FAILED');
  const intake = await fixture.store.get('intakes', receipt.intake_id);
  assert.equal(intake?.state, 'received');
  assert.equal(intake?.retryable, true);
  assert.equal(intake?.error_message?.includes('temporary filesystem failure'), false);
});

test('来源配置变化使尚未提交的上传作业和接收同时取消，不留下失败或可重试的假状态', async (context) => {
  const fixture = await createTestHub(context);
  const bytes = await archive([{ path: 'SKILL.md', bytes: skillDocument(), executable: false }]);
  const receipt = await fixture.hub.intakes.receive(
    fixture.admin,
    bytes,
    'skill.zip',
    {
      target: 'new',
      kind: 'skill',
      slug: 'sample-skill',
      owner_group_id: fixture.teamId,
      version_label: '1.0.0',
    },
    randomUUID(),
  );
  const intake = await fixture.store.get('intakes', receipt.intake_id);
  assert(intake);
  const source = await fixture.store.get('sources', intake.source_id);
  assert(source);
  await fixture.store.put('sources', { ...source, revision: source.revision + 1 });
  await fixture.worker.tick();
  const current = await fixture.store.get('intakes', intake.id);
  assert.equal(current?.state, 'cancelled');
  assert.equal(current?.error_code, 'SOURCE_CONFIG_CHANGED');
  assert.equal(current?.retryable, false);
  assert(current?.finished_at);
  assert.equal((await fixture.store.all('jobs'))[0].state, 'cancelled');
  assert.deepEqual(await fixture.store.all('versions'), []);
});
