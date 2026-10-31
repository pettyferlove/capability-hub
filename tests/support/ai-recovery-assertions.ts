import assert from 'node:assert/strict';
import type { TestContext } from 'node:test';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { snapshotStore, parseSnapshot, restoreStore } from '@capability-hub/infrastructure/store';
import type { RecordStore } from '@capability-hub/application/ports';
import { ScopedMemoryStorage, ScopedWorkflowsStorage } from '@capability-hub/ai/storage';
import { AiError } from '@capability-hub/ai';
import { recoveryRuntime, type CrashStage } from './ai-recovery.js';
import { createSqliteStore } from './store.js';

export type RecoveryDatabase =
  { driver: 'sqlite'; path: string } | { driver: 'postgresql'; url: string };

export async function assertCrashRecovery(
  t: TestContext,
  store: RecordStore,
  database: RecoveryDatabase,
  stage: CrashStage,
) {
  const { runtime, claim } = recoveryRuntime(store);
  const execution = await runtime.submit(randomUUID(), 'recoverable', { value: 5 });
  await runtime.process(await claim(), new AbortController().signal);
  const waiting = await runtime.view(execution.id);
  assert.equal(waiting.execution.status, 'waiting_input');
  const interaction = waiting.interactions[0]!;
  await runtime.respond(
    execution.id,
    interaction.id,
    execution.owner_id,
    interaction.payload.revision,
    { approved: true },
  );
  const child = fork(
    fileURLToPath(new URL('../fixtures/ai-recovery-child.ts', import.meta.url)),
    [],
    {
      execArgv: [
        '--conditions=development',
        '--import',
        fileURLToPath(new URL('../../scripts/testing/register-test-runtime.mjs', import.meta.url)),
      ],
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    },
  );
  t.after(() => {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
  });
  let stderr = '';
  child.stderr?.on('data', (chunk: Buffer) => {
    stderr += chunk.toString();
  });
  child.stdout?.resume();
  const arrived = once(child, 'message');
  child.send({ database, stage });
  const [message] = await Promise.race([
    arrived,
    once(child, 'exit').then(() => {
      throw new Error(`Recovery child ended: ${stderr.slice(0, 1000)}`);
    }),
  ]);
  assert.deepEqual(message, { checkpoint: stage });
  const exited = once(child, 'exit');
  child.kill('SIGKILL');
  await exited;
  const active = (await store.all('jobs')).find(
    (job) => job.aggregate_id === execution.id && job.state === 'running',
  );
  assert(active);
  await store.put('jobs', { ...active, lease_until: 0 });
  const next = recoveryRuntime(store);
  await next.runtime.process(await next.claim(), new AbortController().signal);
  const result = await next.runtime.view(execution.id);
  assert.equal(
    result.execution.status,
    'succeeded',
    JSON.stringify(result.execution.payload.error),
  );
  assert.deepEqual(result.execution.payload.result, { value: 6 });
  assert.equal(
    (await store.all('audit')).filter((row) => row.action === 'ai.recovery-effect').length,
    1,
  );
  assert.equal(result.interactions.length, 1);
  assert.equal(result.interactions[0]?.status, 'applied');
  const snapshots = await next.ai.list('ai_snapshots', { execution_id: execution.id, limit: 100 });
  assert(
    snapshots.every(
      (snapshot) => snapshot.payload.projected_revision === snapshot.payload.snapshot_revision,
    ),
  );
}

export async function assertLeaseIsolation(t: TestContext, store: RecordStore) {
  const { runtime, claim, ai } = recoveryRuntime(store);
  const execution = await runtime.submit(randomUUID(), 'recoverable', { value: 1 });
  const lease = await claim();
  execution.status = 'running';
  await ai.put('ai_executions', execution);
  const scope = {
    lease,
    owner_id: execution.owner_id,
    definition_digest: execution.payload.definition_digest,
    controller: new AbortController(),
  };
  const memory = new ScopedMemoryStorage(runtime.scope);
  const workflows = new ScopedWorkflowsStorage(runtime.scope);
  await runtime.scope.run(scope, async () => {
    await memory.saveThread({
      thread: {
        id: 'thread-one',
        resourceId: execution.owner_id,
        createdAt: new Date(),
        updatedAt: new Date(),
        title: 'test',
      },
    });
  });
  const job = await store.get('jobs', lease.dispatch_id);
  assert(job);
  await store.put('jobs', { ...job, lease_until: 0 });
  const rejected = (error: unknown) => error instanceof AiError && error.code === 'AI_LEASE_LOST';
  await runtime.scope.run(scope, async () => {
    await assert.rejects(() => runtime.events.emit('step.started', { step_id: 'late' }), rejected);
    await assert.rejects(() => memory.updateThread({ id: 'thread-one', title: 'late' }), rejected);
    await assert.rejects(() => memory.deleteThread({ threadId: 'thread-one' }), rejected);
    await assert.rejects(
      () =>
        workflows.deleteWorkflowRunById({
          workflowName: 'recoverable',
          runId: execution.payload.native_run_id,
        }),
      rejected,
    );
  });
  const newer = await claim();
  assert(newer.epoch > lease.epoch);
  await runtime.scope.run(scope, () =>
    assert.rejects(() => runtime.events.emit('step.completed', { step_id: 'late' }), rejected),
  );
  const newScope = { ...scope, lease: newer };
  await runtime.scope.run(newScope, async () => {
    const before = await runtime.get(execution.id);
    await assert.rejects(
      () =>
        store.tx(async () => {
          await store.insert('groups', {
            id: randomUUID(),
            revision: 1,
            active: true,
            name: 'must-roll-back',
          });
          await runtime.events.emit('step.started', { step_id: 'rolled-back' });
          throw new Error('rollback');
        }),
      /rollback/,
    );
    assert.equal((await runtime.get(execution.id)).payload.last_seq, before.payload.last_seq);
    assert.equal((await store.all('groups')).length, 0);
  });
  const backup = parseSnapshot(await snapshotStore(store));
  const target = await createSqliteStore(t);
  await restoreStore(target.store, backup);
  assert.deepEqual(await snapshotStore(target.store), backup);
}
