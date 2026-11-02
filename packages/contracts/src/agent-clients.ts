import { z } from 'zod';

/**
 * 支持自动配置的客户端标识全集；顺序即接入说明表格中的展示顺序。
 * {@link agentClients} 与每个适配分支都必须与这里保持一一对应。
 */
export const agentClientIds = [
  'codex',
  'claude-code',
  'cursor',
  'opencode',
  'pi',
  'gemini-cli',
  'vscode',
  'copilot-cli',
] as const;

/** 客户端标识校验：只接受 {@link agentClientIds} 中的值。 */
export const agentClientSchema = z.enum(agentClientIds);

/** {@link agentClientSchema} 的输出侧类型。 */
export type AgentClient = z.infer<typeof agentClientSchema>;

/** 配置作用范围：`project` 写入当前仓库，`user` 写入当前用户级配置。 */
export const agentConfigurationScopeSchema = z.enum(['project', 'user']);

/** 首次接入和重复接入共用同一个只读探测，空目录同样可以完成验证。 */
export const hubConnectionCheck =
  '在目标客户端发现 Hub 工具后调用 search_skills({"query":"","limit":1})。调用成功即验证了连接，items 为空也算成功。';

/** 宿主管理的用户配置文件必须由客户端确定路径，助手不能推断。 */
export function needsAssistantConfigFile(client: AgentClient, scope: 'project' | 'user'): boolean {
  return scope === 'user' && (client === 'claude-code' || client === 'vscode');
}

/**
 * 接入页面查询串：`client` 必填，`scope` 默认 `project`，`method` 默认 `oauth`，
 * `permission` 默认 `read`（`contribute` 需显式指定才会申请写权限）；严格模式拒绝未知参数。
 */
export const hubConnectionQuerySchema = z
  .object({
    client: agentClientSchema,
    scope: agentConfigurationScopeSchema.default('project'),
    method: z.enum(['oauth', 'assistant', 'token']).default('oauth'),
    permission: z.enum(['read', 'contribute']).default('read'),
  })
  .strict();

interface AgentClientRecord {
  label: string;
  projectConfig: string;
  userConfig: string;
  skillDirectory: string;
  documentation: string;
  note: string;
}

/** 客户端配置约定；官方资料与核验边界见 documents/reference/agent-clients.md。 */
export const agentClients: Record<AgentClient, AgentClientRecord> = {
  codex: {
    label: 'Codex',
    projectConfig: '.codex/config.toml',
    userConfig: '~/.codex/config.toml',
    skillDirectory: '.agents/skills',
    documentation: 'https://developers.openai.com/codex/mcp/',
    note: '项目配置需要信任该项目；在客户端检查 MCP 连接与工具列表。',
  },
  'claude-code': {
    label: 'Claude Code',
    projectConfig: '.mcp.json',
    userConfig: '通过 claude mcp add --scope user 登记',
    skillDirectory: '.claude/skills',
    documentation: 'https://code.claude.com/docs/en/mcp',
    note: '合并项目配置后，在 Claude Code 中通过 /mcp 检查连接。',
  },
  cursor: {
    label: 'Cursor',
    projectConfig: '.cursor/mcp.json',
    userConfig: '~/.cursor/mcp.json',
    skillDirectory: '.cursor/skills',
    documentation: 'https://cursor.com/docs/context/mcp',
    note: '在 Cursor 的 MCP 设置中检查服务状态与工具列表。',
  },
  opencode: {
    label: 'OpenCode',
    projectConfig: 'opencode.json',
    userConfig: '~/.config/opencode/opencode.json',
    skillDirectory: '.opencode/skills',
    documentation: 'https://opencode.ai/docs/mcp-servers/',
    note: '已有 opencode.jsonc 时合并到该文件；使用 opencode mcp list 检查连接。',
  },
  pi: {
    label: 'Pi',
    projectConfig: '.pi/mcp.json',
    userConfig: '~/.pi/agent/mcp.json',
    skillDirectory: '.agents/skills',
    documentation:
      'https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/mcp.md',
    note: '需要提供原生 MCP 的 Pi 版本；信任项目后 /reload，再通过 /mcp 检查连接。',
  },
  'gemini-cli': {
    label: 'Gemini CLI',
    projectConfig: '.gemini/settings.json',
    userConfig: '~/.gemini/settings.json',
    skillDirectory: '.gemini/skills',
    documentation: 'https://geminicli.com/docs/tools/mcp-server/',
    note: '保留 settings.json 中的其他设置；重新加载后通过 /mcp 检查连接。',
  },
  vscode: {
    label: 'VS Code',
    projectConfig: '.vscode/mcp.json',
    userConfig: '通过 MCP: Open User Configuration 打开用户 mcp.json',
    skillDirectory: '.github/skills',
    documentation: 'https://code.visualstudio.com/docs/agents/reference/mcp-configuration',
    note: '使用 VS Code 格式；通过 MCP: List Servers 检查连接，远程窗口需在远程主机设置变量。',
  },
  'copilot-cli': {
    label: 'GitHub Copilot CLI',
    projectConfig: '.mcp.json',
    userConfig: '~/.copilot/mcp-config.json',
    skillDirectory: '.github/skills',
    documentation:
      'https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-mcp-servers',
    note: '使用 Copilot 可移植配置；设置 COPILOT_HOME 时用户配置位于该目录，通过 /mcp 检查连接。',
  },
};

/**
 * 生成客户端可识别的环境变量插值写法：OpenCode 为 `{env:NAME}`，Cursor 与 VS Code 为
 * `${env:NAME}`，其余为 `${NAME}`。只拼接语法，不读取环境变量，也不校验变量是否已设置。
 */
export function clientEnvironmentReference(client: AgentClient, name: string): string {
  if (client === 'opencode') return `{env:${name}}`;
  return client === 'cursor' || client === 'vscode' ? `\${env:${name}}` : `\${${name}}`;
}

/**
 * 通用 MCP 服务记录，字段沿用主流客户端的公共子集；{@link renderMcpClientConfiguration}
 * 会按客户端改写键名，因此这里只描述语义，不代表最终落盘格式。
 */
export interface McpClientServerRecord {
  url?: string;
  command?: string;
  args?: string[];
  headers?: Record<string, string>;
  env?: Record<string, string>;
  bearer_token_env_var?: string;
  env_http_headers?: Record<string, string>;
  env_vars?: string[];
  scopes?: string[];
  oauth?: { scope: string } | { enabled: true; scopes: string[] };
}

/** 仅序列化已校验的安装项，不读取本机环境、不写配置、不连接服务。 */
export function renderMcpClientConfiguration(
  client: AgentClient,
  name: string,
  server: McpClientServerRecord,
  scope: 'project' | 'user' = 'project',
) {
  const config: Record<string, unknown> = { ...server };
  let root = 'mcpServers';
  if (client === 'codex') {
    root = 'mcp_servers';
    if (server.headers) {
      config.http_headers = server.headers;
      delete config.headers;
    }
  } else if (client === 'opencode') {
    root = 'mcp';
    config.type = server.url ? 'remote' : 'local';
    if (
      server.url &&
      Object.keys(server.headers ?? {}).some((name) => name.toLowerCase() === 'authorization')
    )
      config.oauth = false;
    if (server.command) {
      config.command = [server.command, ...(server.args ?? [])];
      delete config.args;
    }
    if (server.env) {
      config.environment = server.env;
      delete config.env;
    }
  } else if (client === 'gemini-cli') {
    if (server.url) {
      config.httpUrl = server.url;
      delete config.url;
    }
  } else if (client === 'vscode') {
    root = 'servers';
    config.type = server.url ? 'http' : 'stdio';
  } else if (client === 'copilot-cli') {
    config.type = server.url ? 'http' : 'stdio';
    config.tools = ['*'];
  } else if (client === 'claude-code' && server.url) {
    config.type = 'http';
  }
  const structured = { [root]: { [name]: config } };
  const text =
    client === 'codex'
      ? [
          `[mcp_servers.${JSON.stringify(name)}]`,
          ...Object.entries(config).map(([key, value]) =>
            value && typeof value === 'object' && !Array.isArray(value)
              ? `${key} = { ${Object.entries(value as Record<string, unknown>)
                  .map(([k, v]) => `${JSON.stringify(k)} = ${JSON.stringify(v)}`)
                  .join(', ')} }`
              : `${key} = ${JSON.stringify(value)}`,
          ),
        ].join('\n')
      : JSON.stringify(structured, null, 2);
  return {
    config: structured,
    text,
    target_file:
      scope === 'project' ? agentClients[client].projectConfig : agentClients[client].userConfig,
  };
}

function nativeHubAuthorization(client: AgentClient, permission: 'read' | 'contribute') {
  const scopes = permission === 'contribute' ? ['hub:read', 'hub:contribute'] : ['hub:read'];
  switch (client) {
    case 'codex':
      return { scopes };
    case 'opencode':
    case 'pi':
      return { oauth: { scope: scopes.join(' ') } };
    case 'gemini-cli':
      return { oauth: { enabled: true as const, scopes } };
    default:
      return permission === 'read' ? {} : undefined;
  }
}

/** 只有能表达所选权限的原生适配才生成 OAuth 配置，其余贡献连接由本地助手申请范围。 */
export function hubMcpClientConfiguration(
  client: AgentClient,
  endpoint: string,
  scope: 'project' | 'user' = 'project',
  method: 'oauth' | 'assistant' | 'token' = 'oauth',
  permission: 'read' | 'contribute' = 'read',
) {
  if (method === 'oauth') {
    const authorization = nativeHubAuthorization(client, permission);
    if (authorization)
      return {
        method,
        ...renderMcpClientConfiguration(
          client,
          'capability-hub',
          { url: endpoint, ...authorization },
          scope,
        ),
      };
  }
  if (method !== 'token')
    return {
      method: 'assistant' as const,
      ...renderMcpClientConfiguration(
        client,
        'capability-hub',
        {
          command: 'capability-hub',
          args: ['bridge', '--url', new URL(endpoint).origin, '--client', client],
        },
        scope,
      ),
    };
  return {
    method,
    ...renderMcpClientConfiguration(
      client,
      'capability-hub',
      {
        url: endpoint,
        ...(client === 'codex'
          ? { bearer_token_env_var: 'CAPABILITY_HUB_TOKEN' }
          : {
              headers: {
                Authorization: `Bearer ${clientEnvironmentReference(client, 'CAPABILITY_HUB_TOKEN')}`,
              },
            }),
      },
      scope,
    ),
  };
}

/** 首次接入说明只包含公开地址和变量名，不依赖已连接的 Hub 工具。 */
export function hubMcpConnectionGuide(
  client: AgentClient,
  origin: string,
  scope: 'project' | 'user' = 'project',
  requestedMethod: 'oauth' | 'assistant' | 'token' = 'oauth',
  permission: 'read' | 'contribute' = 'read',
) {
  const base = new URL(origin).origin;
  const configuration = hubMcpClientConfiguration(
    client,
    `${base}/mcp`,
    scope,
    requestedMethod,
    permission,
  );
  const { method } = configuration;
  const authorizationNote =
    method === 'token'
      ? '高级手动方式：由用户在客户端运行环境设置 CAPABILITY_HUB_TOKEN；不要把真实令牌粘贴到对话或提交到仓库。'
      : method === 'assistant'
        ? '接入助手会发起浏览器授权、私有保存凭据并配置本地桥接，无需手动复制令牌。'
        : '使用客户端原生 OAuth 登录，在浏览器登录 Hub 并确认连接，凭据由客户端管理，无需设置环境变量。';
  const needsPath = needsAssistantConfigFile(client, scope);
  const targetFile =
    method === 'assistant' && needsPath
      ? `${agentClients[client].label} 的用户配置文件（由 --config-file 指定）`
      : configuration.target_file;
  const assistantCommand = `capability-hub connect --url ${base} --client ${client} --scope ${scope}${permission === 'contribute' ? ' --contribute' : ''}${needsPath ? ' --config-file ""' : ''}`;
  const assistantInstruction = [
    ...(method !== requestedMethod
      ? ['当前适配通过接入助手申请贡献权限。请先确认使用本地桥接。']
      : []),
    '先安装部署方提供的 Capability Hub CLI，在运行 Agent 的同一环境执行。',
    ...(needsPath
      ? [
          client === 'vscode'
            ? '通过 MCP: Open User Configuration 确认用户 mcp.json 的路径。'
            : '确认 Claude Code 当前用户配置文件的路径。',
          '将 --config-file 后的空引号填入该文件的实际绝对路径。交互终端也可保留空值，由助手询问路径。',
        ]
      : []),
  ].join('');
  const notes = [
    agentClients[client].note,
    authorizationNote,
    ...(method === 'assistant' ? [assistantInstruction] : []),
    '客户端需要能访问此 Hub 地址；远程 Agent 中的 localhost 指向远程主机。',
    hubConnectionCheck,
  ];
  const loginInstruction =
    client === 'codex'
      ? `运行 codex mcp login capability-hub --scopes ${permission === 'contribute' ? 'hub:read,hub:contribute' : 'hub:read'} 发起授权。`
      : client === 'opencode'
        ? '运行 opencode mcp auth capability-hub 发起授权。'
        : '在客户端 MCP 设置中选择 capability-hub 并完成登录或授权。';
  const installation_prompt = [
    `请为 ${agentClients[client].label} 接入 Capability Hub MCP，作用域：${scope === 'project' ? '当前项目' : '当前用户'}。`,
    `Hub 地址：${base}；MCP 地址：${base}/mcp。`,
    `目标配置位置：${targetFile}。`,
    '先核对当前连接的实际目标。若同一实例已通过检索验证且具备本次任务所需工具，沿用连接并继续原任务。同名目标不同须先确认替换。',
    method === 'assistant'
      ? '检查当前客户端版本和已有配置；由接入助手合并配置，不要先手动写入下方示例。助手会写入实际运行路径；已有同名条目时先核对地址和差异。'
      : '检查当前客户端版本和已有配置，合并 capability-hub 条目并保留其他设置；已有同名条目时先核对地址和差异。',
    `\n\`\`\`${client === 'codex' ? 'toml' : 'json'}\n${configuration.text}\n\`\`\`\n`,
    ...(method === 'assistant'
      ? [assistantCommand]
      : method === 'token'
        ? [`手动令牌入口：${base}/connect，展开高级手动接入。`]
        : [
            loginInstruction,
            '原生 OAuth 不可用时，先确认是否需要使用接入助手；不要自动降级为手动令牌。',
            assistantInstruction,
            assistantCommand,
          ]),
    ...notes,
    ...(permission === 'contribute'
      ? [
          method === 'token'
            ? '请用户选择具有贡献范围的手动令牌，刷新后确认本次所需的贡献工具可见。'
            : '授权时勾选分享、推荐与反馈。已有只读连接需重新授权，刷新后确认本次所需的贡献工具可见。账号权限仍决定可操作的资源。',
        ]
      : []),
    method === 'token'
      ? '手动令牌由用户在客户端运行环境设置，不要搜索、读取或回显秘密值。'
      : '浏览器登录及授权确认由用户完成，不要搜索、读取或回显秘密值。',
    '如需项目信任、重启或当前 Agent 无法写入配置，请明确给出用户操作步骤。分别报告配置写入、授权和实际连接验证的结果。',
    '连接成功后继续用户最初的检索或安装任务，不要求用户重新复制原始请求。',
  ].join('\n');
  return {
    client,
    scope,
    permission,
    hub_url: base,
    ...configuration,
    target_file: targetFile,
    native_oauth_available: !!nativeHubAuthorization(client, permission),
    installation_prompt,
    notes,
    assistant_command: assistantCommand,
    assistant_instruction: assistantInstruction,
    required_variables:
      method === 'token'
        ? [{ name: 'CAPABILITY_HUB_TOKEN', secret: true, instruction: authorizationNote }]
        : [],
    runtime_client_verification: false as const,
  };
}
