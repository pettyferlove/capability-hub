import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sha256 } from '@capability-hub/domain/canonical';
import { serveTestHub } from '../support/server.js';
import { publishSkill } from '../support/application.js';

function object(value: unknown): Record<string, unknown> {
  assert(value && typeof value === 'object' && !Array.isArray(value));
  return value as Record<string, unknown>;
}

async function rpcMessage(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  assert.equal(response.status, 200, text);
  const payloads = response.headers.get('content-type')?.startsWith('text/event-stream')
    ? text
        .split(/\r?\n/)
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5))
    : [text];
  const message = payloads
    .map((payload) => object(JSON.parse(payload)))
    .find((item) => 'id' in item);
  assert(message, text);
  return message;
}

async function rpcResult(response: Response): Promise<Record<string, unknown>> {
  const message = await rpcMessage(response);
  assert.equal(message.error, undefined, JSON.stringify(message));
  return object(message.result);
}

for (const version of ['2025-03-26', '2025-06-18', '2025-11-25']) {
  test(`MCP ${version} 握手、工具调用与逐请求权限支持 Streamable HTTP 客户端`, async (context) => {
    const fixture = await serveTestHub(context);
    const { intake } = await publishSkill(fixture);
    const token = await fixture.hub.tokens.issue(fixture.reader, {
      name: 'read',
      scope: 'hub:read',
    });
    let id = 0;
    const post = (
      method: string,
      params: Record<string, unknown> = {},
      options: { initialize?: boolean; notification?: boolean; bearer?: string } = {},
    ) =>
      fetch(fixture.origin + '/mcp', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + (options.bearer ?? token.token),
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
          ...(options.initialize ? {} : { 'MCP-Protocol-Version': version }),
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          ...(options.notification ? {} : { id: ++id }),
          method,
          params,
        }),
        signal: AbortSignal.timeout(10_000),
      });

    // OMP 首次握手只在请求体声明版本，后续请求才发送协议 Header。
    const initialize = await post(
      'initialize',
      {
        protocolVersion: version,
        capabilities: { roots: { listChanged: false } },
        clientInfo: { name: 'omp-compatible-test', version: '1.0.0' },
      },
      { initialize: true },
    );
    assert.equal(initialize.headers.get('mcp-session-id'), null);
    assert.equal((await rpcResult(initialize)).protocolVersion, version);
    const notification = await post('notifications/initialized', {}, { notification: true });
    assert.equal(notification.status, 202);
    await notification.text();

    const listed = await rpcResult(await post('tools/list'));
    assert(Array.isArray(listed.tools));
    const names = listed.tools.map((tool: unknown) => object(tool).name);
    assert.equal(names.length, 7);
    assert(names.includes('load_skill'));
    assert(!names.includes('share_skill'));
    const loaded = await rpcResult(
      await post('tools/call', {
        name: 'load_skill',
        arguments: { version_id: intake.version_id },
      }),
    );
    assert.equal(loaded.isError, undefined);
    assert(Array.isArray(loaded.content));
    const content = object(JSON.parse(String(object(loaded.content[0]).text)));
    assert.match(String(content.body), /# 工程实践/);

    const denied = await rpcMessage(
      await post('tools/call', {
        name: 'share_skill',
        arguments: {},
      }),
    );
    assert.equal(object(denied.error).code, -32602);
    assert.match(String(object(denied.error).message), /Tool share_skill not found/);

    const contributor = await fixture.hub.tokens.issue(fixture.reader, {
      name: 'contribute',
      scope: 'hub:contribute',
    });
    const contributed = await rpcResult(
      await post('tools/list', {}, { bearer: contributor.token }),
    );
    assert(Array.isArray(contributed.tools));
    assert.equal(contributed.tools.length, 10);

    await fixture.hub.tokens.revoke(fixture.reader.id, sha256(token.token));
    const revoked = await post('tools/list');
    assert.equal(revoked.status, 401);
    assert.equal(object(object(await revoked.json()).error).code, 'UNAUTHENTICATED');
  });
}
