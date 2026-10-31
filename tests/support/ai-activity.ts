import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { RecordStore } from '@capability-hub/application/ports';
import { recoveryRuntime } from './ai-recovery.js';

export async function assertActivityHistory(store: RecordStore) {
  const { runtime, ai } = recoveryRuntime(store);
  const execution = await runtime.submit(randomUUID(), 'recoverable', { value: 1 });
  await ai.tx(async () => {
    await runtime.events.append(execution, 'tool.started', {
      tool_id: 'inspect-text',
      invocation_id: 'tool-one',
    });
    await runtime.events.append(execution, 'message.started', {
      message_id: 'assistant:one',
      block_id: 'block',
      format: 'text',
    });
    for (let offset = 0; offset < 1005; offset++) {
      await runtime.events.append(execution, 'message.delta', {
        message_id: 'assistant:one',
        block_id: 'block',
        offset,
        delta: '字',
      });
    }
    await runtime.events.append(execution, 'message.completed', {
      message_id: 'assistant:one',
      block_id: 'block',
      length: 1005,
    });
    await runtime.events.append(execution, 'tool.completed', {
      tool_id: 'inspect-text',
      invocation_id: 'tool-one',
    });
  });
  const foreign = await runtime.submit(randomUUID(), 'recoverable', { value: 2 });
  await ai.tx(() =>
    runtime.events.append(foreign, 'tool.started', {
      tool_id: 'private-tool',
      invocation_id: 'foreign',
    }),
  );
  const view = await runtime.view(execution.id);
  assert.deepEqual(
    view.activity.map((event) => event.payload.type),
    ['execution.queued', 'tool.started', 'message.started', 'tool.completed'],
  );
  assert.equal(view.activity_truncated, false);
  assert.equal(view.execution.payload.message_blocks[0]?.text.length, 1005);
  assert(
    view.activity.every(
      (event) => event.execution_id === execution.id && event.position <= view.watermark,
    ),
  );
  const bounded = await ai.list('ai_events', {
    execution_id: execution.id,
    event_types: ['tool.started', 'tool.completed'],
    before_position: view.watermark,
    descending: true,
    limit: 1,
  });
  assert.equal(bounded[0]?.payload.type, 'tool.started');
  assert.deepEqual(
    (await recoveryRuntime(store).runtime.view(execution.id)).activity,
    view.activity,
  );
  await ai.tx(async () => {
    for (let index = 0; index < 1001; index++)
      await runtime.events.append(execution, 'step.completed', {
        step_id: `step-${index}`,
        duration_ms: 1,
      });
  });
  const recent = await runtime.view(execution.id);
  assert.equal(recent.activity.length, 1000);
  assert.equal(recent.activity_truncated, true);
  assert.equal(recent.activity[0]?.payload.data.step_id, 'step-1');
  assert.equal(recent.activity.at(-1)?.payload.data.step_id, 'step-1000');
}
