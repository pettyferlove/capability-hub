import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import type { ToolsInput } from '@mastra/core/agent';
import { z } from 'zod';
import type { McpEndpoint } from '../core/config.js';
import type { CredentialResolver } from '../core/ports.js';
import type { OperationContext } from '../operations/context.js';
import { AiError } from '../core/errors.js';
import { asJson } from '../core/records.js';

/**
 * 以已登记的 MCP 端点换一份只读工具集，交给 `work` 使用，结束后关闭连接。
 *
 * 约束与副作用：
 * - `work` 之前先 `authorize('tool', 'mcp:<endpoint>')`，每次调用工具前还会再授权
 *   `mcp:<endpoint>:<tool>`，权限在执行中途被收回即失败；
 * - 逐页列目录最多 10 页，只暴露 `read_only_tools` 白名单内、且声明了 `readOnlyHint` 的工具，
 *   白名单里有但端点不存在同名工具时视为配置错误；单个工具 Schema 上限 32 KB、结果上限 128 KB；
 * - 每个工具的 input schema 与说明会作为 artifact 落库，供后续核对；
 * - 请求只能打到登记的 origin + path（否则 `AI_FORBIDDEN`），重定向一律禁止，凭据按
 *   `credential_ref` 现场解析进 `Authorization` 头；单请求超时 30 秒，并与执行 `signal` 合并。
 */
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
