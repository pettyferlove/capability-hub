import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  aiEventResponseSchema,
  aiExecutionDiagnosticsResponseSchema,
  aiExecutionViewResponseSchema,
} from '@capability-hub/contracts';
import { serveTestHub } from '../support/server.js';
import { publishSkill, testPassword } from '../support/application.js';
import { fixture } from '../support/ai-provider.js';
import { frameworkConfig } from '../support/ai-framework.js';
import { deferred } from '../support/store.js';

async function login(origin: string) {
  const response = await fetch(origin + '/auth/login', {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'owner', password: testPassword }),
  });
  assert.equal(response.status, 200);
  await response.arrayBuffer();
  const cookie = response.headers.get('set-cookie');
  assert(cookie);
  return cookie.split(';')[0]!;
}

function stream(response: Response) {
  assert(response.body);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  return {
    close: () => reader.cancel(),
    async next(): Promise<{ event: string; id?: string; data: unknown }> {
      for (;;) {
        const boundary = buffer.indexOf('\n\n');
        if (boundary >= 0) {
          const block = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          const event = block.match(/^event: (.+)$/m)?.[1];
          const data = block.match(/^data: (.+)$/m)?.[1];
          if (event && data)
            return {
              event,
              id: block.match(/^id: (.+)$/m)?.[1],
              data: JSON.parse(data) as unknown,
            };
        } else {
          const chunk = await reader.read();
          assert(!chunk.done, 'Expected an SSE event');
          buffer += decoder.decode(chunk.value, { stream: true });
        }
      }
    },
  };
}

test('AI SSE 实时增量、断开不取消、游标重放、越界重置和实时撤权', { timeout: 20000 }, async (t) => {
  const provider = await fixture('openai', 'text', true);
  t.after(() => provider.close());
  const previous = process.env.AI_FIXTURE_KEY;
  process.env.AI_FIXTURE_KEY = 'ai-fixture-key';
  t.after(() => {
    if (previous === undefined) delete process.env.AI_FIXTURE_KEY;
    else process.env.AI_FIXTURE_KEY = previous;
  });
  const hub = await serveTestHub(t, { ai: frameworkConfig(provider.url) });
  const cookie = await login(hub.origin);
  const runtime = hub.hub.ai.runtime;
  const execution = await runtime.submit(hub.admin.id, 'assistant', { prompt: 'hello' });
  const url = `${hub.origin}/api/ai/executions/${execution.id}/events`;
  const response = await fetch(url, { headers: { Cookie: cookie } });
  assert.equal(response.status, 200);
  const events = stream(response);
  const initial = await events.next();
  assert.equal(initial.event, 'stream.snapshot');
  const { schema_version: version, ...view } = initial.data as Record<string, unknown>;
  assert.equal(version, 1);
  assert.equal(aiExecutionViewResponseSchema.parse(view).execution.status, 'queued');
  await hub.worker.tick();
  let last = initial;
  while (last.event !== 'message.delta') last = await events.next();
  const delta = aiEventResponseSchema.parse(last.data);
  assert.equal(provider.completed, false);
  assert(delta.seq > 1);
  await events.close();
  assert.equal((await runtime.get(execution.id)).status, 'running');
  provider.release.resolve();
  await hub.worker.waitForIdle();
  const replayResponse = await fetch(url, {
    headers: { Cookie: cookie, 'Last-Event-ID': last.id! },
  });
  const replay = await replayResponse.text();
  assert.doesNotMatch(replay, /stream.snapshot/);
  assert.match(replay, /execution.completed/);
  const positions = [...replay.matchAll(/id: [^\n]+:operator:(\d+)/g)].map((item) =>
    Number(item[1]),
  );
  assert.equal(positions[0], delta.seq + 1);
  assert.equal(new Set(positions).size, positions.length);
  const reset = await fetch(url, {
    headers: { Cookie: cookie, 'Last-Event-ID': `${execution.id}:operator:99999` },
  });
  assert.match(await reset.text(), /event: stream.reset/);
  const foreign = await fetch(url, {
    headers: { Cookie: cookie, 'Last-Event-ID': 'foreign:operator:1' },
  });
  assert.equal(foreign.status, 400);
  await foreign.arrayBuffer();
  const pending = await runtime.submit(hub.admin.id, 'assistant', { prompt: 'pending' });
  const pendingEvents = stream(
    await fetch(`${hub.origin}/api/ai/executions/${pending.id}/events`, {
      headers: { Cookie: cookie },
    }),
  );
  await pendingEvents.next();
  const role = await hub.store.find('roles', 'key', 'admin');
  assert(role);
  await hub.store.put('roles', {
    ...role,
    permissions: role.permissions.filter((permission) => !permission.startsWith('ai:')),
  });
  const revoked = await pendingEvents.next();
  assert.equal(revoked.event, 'stream.error');
  assert.deepEqual(revoked.data, { schema_version: 1, code: 'ACCESS_REVOKED' });
  await pendingEvents.close();
});

for (const delivery of ['detail', 'events', 'diagnostics'] as const)
  test(
    `AI ${delivery} 授权期间并发提交受限资源内容不会越过读取边界`,
    { timeout: 20000 },
    async (t) => {
      const hub = await serveTestHub(t, { ai: frameworkConfig() });
      const publication = await publishSkill(hub);
      const asset = await hub.store.get('assets', publication.intake.asset_id);
      assert(asset);
      await hub.store.put('assets', { ...asset, lifecycle: 'blocked' });
      const cookie = await login(hub.origin);
      const runtime = hub.hub.ai.runtime;
      const execution = await runtime.submit(hub.admin.id, 'assistant', { prompt: 'hello' });
      const checked = deferred();
      const release = deferred();
      t.after(() => release.resolve());
      const principal = hub.hub.ai.principal.bind(hub.hub.ai);
      let reads = 0;
      t.mock.method(hub.hub.ai, 'principal', async (...args: Parameters<typeof principal>) => {
        const result = await principal(...args);
        if (args[1]?.id === execution.id && ++reads === (delivery === 'events' ? 2 : 1)) {
          checked.resolve();
          await release.promise;
        }
        return result;
      });
      const path =
        `/api/ai/executions/${execution.id}` + (delivery === 'detail' ? '' : '/' + delivery);
      const response = fetch(hub.origin + path, {
        headers: {
          Cookie: cookie,
          ...(delivery === 'events' ? { 'Last-Event-ID': `${execution.id}:operator:0` } : {}),
        },
      });
      await checked.promise;
      const writing = runtime.store.tx(async () => {
        const row = await runtime.get(execution.id);
        await runtime.store.insert('ai_artifacts', {
          id: 'restricted-evidence',
          owner_id: row.owner_id,
          execution_id: row.id,
          lookup_key: 'restricted-evidence',
          status: 'committed',
          position: 1,
          created_at: row.created_at,
          updated_at: row.updated_at,
          payload: {
            name: 'resource:restricted',
            media_type: 'application/json',
            digest: 'evidence',
            content: { id: `version:${publication.intake.version_id}/SKILL.md` },
          },
        });
        row.status = 'succeeded';
        row.payload.result = { text: 'restricted-derived-content' };
        await runtime.events.append(row, 'execution.completed', { result: row.payload.result });
      });
      release.resolve();
      const delivered = await response;
      assert.equal(delivered.status, 200);
      const text = await delivered.text();
      await writing;
      assert.doesNotMatch(text, /restricted-derived-content/);
      if (delivery === 'events') assert.match(text, /ACCESS_REVOKED/);
      else if (delivery === 'diagnostics')
        assert.equal(
          aiExecutionDiagnosticsResponseSchema.parse(JSON.parse(text)).execution.result,
          null,
        );
      else
        assert.equal(aiExecutionViewResponseSchema.parse(JSON.parse(text)).execution.result, null);
      const denied = await fetch(hub.origin + path, { headers: { Cookie: cookie } });
      assert.equal(denied.status, 403);
      await denied.arrayBuffer();
    },
  );
