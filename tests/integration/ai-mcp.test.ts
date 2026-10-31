import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { McpServer, createMcpHandler } from '@modelcontextprotocol/server';
import { toNodeHandler } from '@modelcontextprotocol/node';
import { z } from 'zod';
import { fixture } from '../support/ai-provider.js';
import { frameworkFixture, frameworkConfig } from '../support/ai-framework.js';

for (const readOnly of [true, false])
  test(`AI MCP 真实传输与只读工具门禁：readOnly=${readOnly}`, { timeout: 20000 }, async (t) => {
    let calls = 0;
    const handler = createMcpHandler(
      () => {
        const mcp = new McpServer({ name: 'ai-fixture', version: '1' });
        mcp.registerTool(
          'inspect_text',
          {
            inputSchema: z.object({ text: z.string() }).strict(),
            annotations: { readOnlyHint: readOnly },
          },
          async ({ text }) => {
            calls++;
            return { content: [{ type: 'text', text: String(text.length) }] };
          },
        );
        return mcp;
      },
      { legacy: 'stateless' },
    );
    const server = createServer(toNodeHandler(handler));
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    t.after(async () => {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    });
    const address = server.address();
    assert(address && typeof address !== 'string');
    const provider = await fixture('openai', 'tools');
    t.after(() => provider.close());
    const config = frameworkConfig(provider.url);
    config.mcp_endpoints = [
      {
        id: 'fixture',
        url: `http://127.0.0.1:${address.port}/mcp`,
        allow_http: true,
        read_only_tools: ['inspect_text'],
      },
    ];
    const hub = await frameworkFixture(t, config, async (context) => {
      const invoke = () =>
        context.withMcp('fixture', (tools) =>
          context.agent({ id: 'mcp', instructions: 'Use tools.', prompt: 'Count hello', tools }),
        );
      if (!readOnly) {
        await assert.rejects(invoke, /只读/);
        return null;
      }
      const result = await invoke();
      const skill = await context.skill('version:v1/SKILL.md');
      assert.match(skill.instructions, /Follow the evidence/);
      return result;
    });
    const execution = await hub.runtime.submit(hub.admin.id, 'framework-test', {});
    await hub.run();
    const result = await hub.runtime.get(execution.id);
    assert.equal(result.status, 'succeeded', JSON.stringify(result.payload.error));
    assert.equal(calls, readOnly ? 1 : 0);
    assert.equal(provider.requests.length, readOnly ? 2 : 0);
    const artifacts = await hub.runtime.store.list('ai_artifacts', {
      execution_id: execution.id,
      limit: 100,
    });
    if (readOnly)
      assert(artifacts.some((artifact) => artifact.payload.name === 'mcp:fixture:inspect_text'));
  });
