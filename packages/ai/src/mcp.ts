import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import type { ToolsInput } from '@mastra/core/agent';
import { z } from 'zod';
import type { McpEndpoint } from './config.js';
import type { CredentialResolver } from './ports.js';
import type { OperationContext } from './context.js';
import { AiError } from './errors.js';
import { asJson } from './records.js';

export async function withMcpTools<T>(
  context: OperationContext,
  endpoint: McpEndpoint,
  credentials: CredentialResolver,
  work: (tools: ToolsInput) => Promise<T>,
): Promise<T> {
  await context.authorize('tool', `mcp:${endpoint.id}`);
  const url = new URL(endpoint.url);
  const client = new Client({ name: 'capability-hub-ai', version: '0.1.0' });
  try {
    await client.connect(
      new StreamableHTTPClientTransport(url, {
        fetch: async (input, init) => {
          const target = new URL(input instanceof Request ? input.url : String(input));
          if (target.origin !== url.origin || target.pathname !== url.pathname)
            throw new AiError('AI_FORBIDDEN', 'MCP 请求不能离开已登记端点');
          const headers = new Headers(init?.headers);
          if (endpoint.credential_ref)
            headers.set(
              'Authorization',
              `Bearer ${await credentials.resolve(endpoint.credential_ref)}`,
            );
          return fetch(input, {
            ...init,
            headers,
            redirect: 'error',
            signal: AbortSignal.any([
              context.signal,
              AbortSignal.timeout(30000),
              ...(init?.signal ? [init.signal] : []),
            ]),
          });
        },
      }),
    );
    const tools: ToolsInput = {};
    let cursor: string | undefined;
    let pages = 0;
    do {
      if (++pages > 10) throw new AiError('AI_BUDGET_EXCEEDED', 'MCP 工具目录超过限制');
      const page = await client.listTools(cursor ? { cursor } : undefined);
      for (const tool of page.tools) {
        if (!endpoint.read_only_tools.includes(tool.name)) continue;
        if (tool.annotations?.readOnlyHint !== true)
          throw new AiError('AI_CONFIGURATION', '首批 MCP 适配只接受明确声明只读的工具');
        if (JSON.stringify(tool.inputSchema).length > 32000)
          throw new AiError('AI_BUDGET_EXCEEDED', 'MCP 工具 Schema 超过限制');
        const schema = z.fromJSONSchema(tool.inputSchema as Parameters<typeof z.fromJSONSchema>[0]);
        await context.artifact(
          `mcp:${endpoint.id}:${tool.name}`,
          asJson({
            input_schema: tool.inputSchema,
            description: tool.description ?? '',
            read_only: true,
          }),
        );
        tools[tool.name] = context.tool({
          id: `mcp:${endpoint.id}:${tool.name}`,
          description: tool.description?.slice(0, 2000) ?? tool.name,
          input: schema,
          output: z.json(),
          execute: async (input, signal) => {
            signal.throwIfAborted();
            await context.authorize('tool', `mcp:${endpoint.id}:${tool.name}`);
            const args = z.record(z.string(), z.json()).parse(input);
            const result = await client.callTool({ name: tool.name, arguments: args });
            signal.throwIfAborted();
            if (result.isError) throw new AiError('AI_PROVIDER_FAILED', 'MCP 工具返回错误');
            if (Buffer.byteLength(JSON.stringify(result)) > 128000)
              throw new AiError('AI_BUDGET_EXCEEDED', 'MCP 工具结果超过限制');
            return asJson(result);
          },
        });
      }
      cursor = page.nextCursor;
    } while (cursor);
    if (endpoint.read_only_tools.some((name) => !tools[name]))
      throw new AiError('AI_CONFIGURATION', '登记的 MCP 工具不存在');
    return await work(tools);
  } finally {
    await client.close();
  }
}
