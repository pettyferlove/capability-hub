import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { intakeProgressResponseSchema } from '@capability-hub/contracts';
import { archive } from '@capability-hub/infrastructure/content';
import { serveTestHub } from '../support/server.js';
import { testPassword } from '../support/application.js';
import { deferred } from '../support/store.js';
import { skillDocument } from '../support/content.js';

async function login(origin: string, username = 'owner') {
  const response = await fetch(origin + '/auth/login', {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password: testPassword }),
  });
  assert.equal(response.status, 200);
  const cookie = response.headers.get('set-cookie');
  assert(cookie);
  await response.arrayBuffer();
  return cookie.split(';')[0];
}

async function receive(fixture: Awaited<ReturnType<typeof serveTestHub>>) {
  return fixture.hub.intakes.receive(
    fixture.admin,
    await archive([{ path: 'SKILL.md', bytes: skillDocument(), executable: false }]),
    'skill.zip',
    {
      target: 'new',
      slug: 'sample-skill',
      kind: 'skill',
      owner_group_id: fixture.teamId,
      version_label: '1.0.0',
    },
    randomUUID(),
  );
}

function events(response: Response) {
  assert(response.body);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  return {
    reader,
    async next() {
      while (true) {
        const boundary = buffer.indexOf('\n\n');
        if (boundary >= 0) {
          const block = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          const event = block.match(/^event: (.+)$/m)?.[1];
          const data = block.match(/^data: (.+)$/m)?.[1];
          if (event && data) return { event, data: JSON.parse(data) as unknown };
        } else {
          const chunk = await reader.read();
          assert(!chunk.done, '流不应在预期事件前结束');
          buffer += decoder.decode(chunk.value, { stream: true });
        }
      }
    },
  };
}

test(
  'SSE 推送真实阶段、终态与完整阶段历史，重连恢复后不泄露内容引用',
  { timeout: 20000 },
  async (context) => {
    const fixture = await serveTestHub(context);
    const receipt = await receive(fixture);
    const cookie = await login(fixture.origin);
    const response = await fetch(`${fixture.origin}/api/intakes/${receipt.intake_id}/events`, {
      headers: { Cookie: cookie },
    });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type') ?? '', /text\/event-stream/);
    assert.match(response.headers.get('cache-control') ?? '', /no-store/);
    assert.equal(response.headers.get('x-accel-buffering'), 'no');
    const stream = events(response);
    context.after(() => stream.reader.cancel());
    const first = intakeProgressResponseSchema.parse((await stream.next()).data);
    assert.equal(first.state, 'received');
    const enteredRead = deferred(),
      resumeRead = deferred();
    const enteredWrite = deferred(),
      resumeWrite = deferred();
    context.after(() => {
      resumeRead.resolve();
      resumeWrite.resolve();
    });
    const read = fixture.blobs.read.bind(fixture.blobs);
    context.mock.method(fixture.blobs, 'read', async (ref: string) => {
      enteredRead.resolve();
      await resumeRead.promise;
      return read(ref);
    });
    const put = fixture.blobs.put.bind(fixture.blobs);
    context.mock.method(fixture.blobs, 'put', async (bytes: Buffer) => {
      enteredWrite.resolve();
      await resumeWrite.promise;
      return put(bytes);
    });
    const tick = fixture.worker.tick();
    await enteredRead.promise;
    const scanning = intakeProgressResponseSchema.parse((await stream.next()).data);
    assert.equal(scanning.progress.at(-1)?.step, 'scanning');
    resumeRead.resolve();
    await enteredWrite.promise;
    const snapshot = intakeProgressResponseSchema.parse((await stream.next()).data);
    assert.equal(snapshot.progress.at(-1)?.step, 'snapshot');
    resumeWrite.resolve();
    await tick;
    const completeEvent = await stream.next();
    assert.equal(completeEvent.event, 'progress');
    const complete = intakeProgressResponseSchema.parse(completeEvent.data);
    assert.equal(complete.state, 'ready');
    assert.deepEqual(
      complete.progress.map((entry) => entry.step),
      ['received', 'scanning', 'snapshot'],
    );
    assert(complete.finished_at);
    assert.equal('payload_ref' in complete, false);
    assert.equal('version' in complete, false);
    assert.equal((await stream.reader.read()).done, true);
    const reconnected = await fetch(`${fixture.origin}/api/intakes/${receipt.intake_id}/events`, {
      headers: { Cookie: cookie },
    });
    const restored = events(reconnected);
    assert.deepEqual(intakeProgressResponseSchema.parse((await restored.next()).data), complete);
    assert.equal((await restored.reader.read()).done, true);
  },
);

test(
  'SSE 拒绝匿名和无记录权限的会话，长连接在权限撤销后停止发送进度',
  { timeout: 15000 },
  async (context) => {
    const fixture = await serveTestHub(context);
    const receipt = await receive(fixture);
    const path = `${fixture.origin}/api/intakes/${receipt.intake_id}/events`;
    const anonymous = await fetch(path);
    assert.equal(anonymous.status, 401);
    await anonymous.arrayBuffer();
    const outsider = await fetch(path, {
      headers: { Cookie: await login(fixture.origin, 'reader') },
    });
    assert.equal(outsider.status, 403);
    await outsider.arrayBuffer();
    const response = await fetch(path, { headers: { Cookie: await login(fixture.origin) } });
    const stream = events(response);
    context.after(() => stream.reader.cancel());
    assert.equal((await stream.next()).event, 'progress');
    const user = await fixture.store.get('users', fixture.admin.id);
    assert(user);
    await fixture.store.put('users', { ...user, active: false });
    assert.deepEqual(await stream.next(), {
      event: 'stream-error',
      data: { code: 'ACCESS_REVOKED' },
    });
    assert.equal((await stream.reader.read()).done, true);
  },
);
