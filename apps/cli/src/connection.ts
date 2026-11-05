import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { McpServer, fromJsonSchema, type JsonSchemaType } from '@modelcontextprotocol/server';
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { agentClients, type AgentClient } from '@capability-hub/contracts';
import {
  connectionFile,
  connectionToken,
  authorizeConnection,
  withConnectionLock,
  readConnection,
  type ConnectionCredentials,
} from './connection-auth.js';
import {
  prepareConnectionConfig,
  writeConnectionConfig,
  type ConnectionConfigOptions,
} from './connection-config.js';
import { savePrivateJson } from './private-json.js';
import { HubApiClient, HubApiError, terminalText } from './api-client.js';
import { CliUi } from './cli-ui.js';

/**
 * 打开到 Hub MCP 的连接：请求被限制在 `<url>/mcp` 这一路径内，令牌每次请求前换取，
 * 因此刷新后无需重建连接；401 转成 `UNAUTHENTICATED` 提示重新 `connect`。
 * 连接建立失败会先 `close()` 再抛错，不留下半开的会话。
 */
export async function openHubConnection(url: string, path: string) {
  const identity = await readConnection(path, url);
  const client = new Client({ name: 'capability-hub-bridge', version: '0.1.0' });
  try {
    await client.connect(
      new StreamableHTTPClientTransport(new URL(url + '/mcp'), {
        fetch: async (input, init) => {
          const target = new URL(input instanceof Request ? input.url : String(input));
          if (target.origin !== url || target.pathname !== '/mcp')
            throw new Error('桥接请求不能离开当前 Hub MCP');
          const headers = new Headers(init?.headers);
          headers.set(
            'Authorization',
            'Bearer ' + (await connectionToken(path, url, identity.client_id)),
          );
          const response = await fetch(input, { ...init, headers, redirect: 'error' });
          if (response.status === 401) {
            await response.body?.cancel();
            throw new HubApiError(401, 'UNAUTHENTICATED', '连接已失效，请重新运行 connect 授权');
          }
          return response;
        },
      }),
    );
  } catch (error) {
    await client.close();
    throw error;
  }
  return client;
}

/**
 * 完整接入流程：准备配置 → 复用或新建授权 → 用新令牌实跑一次 `listTools` 与 `search_skills` 验证
 * → 在凭据锁内确认没有被其他进程换过身份 → 写配置再落凭据。顺序是先验证后提交，
 * 验证失败时既不写配置也不写凭据；中途失败会撤销这次新授权的令牌，`--contribute` 却没拿到
 * `hub:contribute` 时同样放弃，保留原有连接与配置。
 */
export async function connectAgent(
  options: ConnectionConfigOptions & { contribute: boolean; noBrowser: boolean },
  ui = new CliUi(),
) {
  const prepared = await prepareConnectionConfig(options);
  if (ui.interactive)
    ui.step(
      '连接设置',
      `Hub 地址  ${options.url}\n客户端    ${agentClients[options.client].label}\n配置范围  ${options.scope === 'user' ? '当前用户' : '当前项目'}\n配置文件  ${terminalText(prepared.target)}\n访问权限  ${options.contribute ? '读取、分享、推荐与反馈' : '只读'}`,
    );
  const path = connectionFile(options.directory, options.url, options.client);
  let previous: ConnectionCredentials | null;
  try {
    previous = await readConnection(path, options.url);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    previous = null;
  }
  let reuse =
    !!previous && (!options.contribute || previous.scope.split(' ').includes('hub:contribute'));
  if (reuse) {
    try {
      const client = await openHubConnection(options.url, path);
      try {
        await client.listTools();
      } finally {
        await client.close();
      }
    } catch (error) {
      if (error instanceof HubApiError && (error.status === 401 || error.code === 'invalid_grant'))
        reuse = false;
      else throw error;
    }
  }
  if (reuse && ui.interactive) ui.step('连接授权', '复用当前 Hub 与客户端的已有授权');
  let pending: ConnectionCredentials | null = null;
  let committed = false;
  const temporary = path + '.pending-' + randomUUID();
  try {
    if (!reuse) {
      pending = await authorizeConnection(
        options.url,
        options.client,
        options.contribute,
        options.noBrowser,
        ui,
      );
      if (options.contribute && !pending.scope.split(' ').includes('hub:contribute'))
        throw new Error(
          '本次只授予了读取权限，原连接和配置已保留。需要分享时请重新运行 connect --contribute，并在浏览器勾选对应权限。',
        );
      await savePrivateJson(temporary, pending);
    }
    const toolCount = await ui.task(
      '验证 Hub 工具发现与检索',
      'Hub 工具发现与检索已验证',
      async () => {
        const client = await openHubConnection(options.url, pending ? temporary : path);
        try {
          const tools = await client.listTools();
          const result = await client.callTool({
            name: 'search_skills',
            arguments: { query: '', limit: 1 },
          });
          if ('isError' in result && result.isError)
            throw new Error('Hub 检索验证失败，请检查账号权限');
          return tools.tools.length;
        } finally {
          await client.close();
        }
      },
    );
    let superseded: ConnectionCredentials | null = null;
    await withConnectionLock(path, async () => {
      let latest: ConnectionCredentials | null;
      try {
        latest = await readConnection(path, options.url);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        latest = null;
      }
      if (latest?.client_id !== previous?.client_id)
        throw new Error('另一接入进程已经更换了此连接，请重新运行 connect；已保留它的授权与配置');
      const backup = await writeConnectionConfig(prepared);
      if (backup) ui.message(`配置原文已备份到私有目录：${terminalText(backup)}`);
      if (pending) {
        await savePrivateJson(path, pending);
        superseded = latest;
      }
      committed = true;
    });
    if (superseded) await revokeConnection(options.url, superseded);
    ui.step(
      '配置已保存',
      `${terminalText(prepared.target)}\n${agentClients[options.client].label} · ${toolCount} 个可用工具 · 检索成功`,
    );
    ui.note(
      '下一步',
      `在 ${agentClients[options.client].label} 中重新加载 Hub MCP。\n完成项目信任后，调用 search_skills 搜索资源。`,
    );
    ui.outro(`${agentClients[options.client].label} 接入配置已就绪。`);
  } finally {
    await rm(temporary, { force: true });
    if (pending && !committed) await revokeConnection(options.url, pending);
  }
}

async function revokeConnection(url: string, credentials: ConnectionCredentials) {
  try {
    const response = await new HubApiClient(url).request('/oauth/revoke', {
      token: credentials.refresh_token,
      client_id: credentials.client_id,
    });
    await response.body?.cancel();
  } catch {
    process.stderr.write('未使用的授权未能自动撤销，可在账号安全中断开对应连接。\n');
  }
}

/**
 * stdio 桥：把 Hub 的工具原样转发给本地客户端，参数与结果都不改写。
 * 监听 stdin 结束与 SIGTERM/SIGINT 关闭两端，宿主进程退出后不留孤儿子进程。
 */
export async function bridgeAgent(url: string, directory: string, agent: AgentClient) {
  const client = await openHubConnection(url, connectionFile(directory, url, agent));
  const server = new McpServer(
    { name: 'capability-hub', version: '0.1.0' },
    { instructions: client.getInstructions() },
  );
  try {
    const { tools } = await client.listTools();
    for (const tool of tools)
      server.registerTool(
        tool.name,
        {
          description: tool.description,
          inputSchema: fromJsonSchema<Record<string, unknown>>(tool.inputSchema as JsonSchemaType),
          annotations: tool.annotations,
        },
        async (args) => {
          const result = await client.callTool({ name: tool.name, arguments: args });
          if (!('content' in result)) throw new Error('Hub 返回了无法桥接的结果');
          return result;
        },
      );
    const transport = new StdioServerTransport();
    await server.connect(transport);
    const close = () => {
      void Promise.allSettled([server.close(), client.close()]);
    };
    process.stdin.once('end', close);
    process.once('SIGTERM', close);
    process.once('SIGINT', close);
  } catch (error) {
    await client.close();
    await server.close();
    throw error;
  }
}

/** 只读自检：列出工具数量并打印，用于排查配置是否正确。 */
export async function checkConnection(
  url: string,
  directory: string,
  agent: AgentClient,
  ui = new CliUi(),
) {
  const count = await ui.task('检查 Hub 连接与工具发现', '连接检查完成', async () => {
    const client = await openHubConnection(url, connectionFile(directory, url, agent));
    try {
      const { tools } = await client.listTools();
      return tools.length;
    } finally {
      await client.close();
    }
  });
  process.stdout.write(`Hub 连接正常，可发现 ${count} 个工具。\n`);
  if (ui.interactive) ui.outro('连接可用，可以继续在 Agent 中使用 Hub。');
}
