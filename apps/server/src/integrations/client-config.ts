import {
  agentClientSchema,
  agentClients,
  clientEnvironmentReference,
  renderMcpClientConfiguration,
  type McpClientServerRecord,
} from '@capability-hub/contracts';
import type { Principal } from '@capability-hub/domain/identity';
import { fail } from '@capability-hub/domain/errors';
import { z } from 'zod';
import type { HubServices } from '../bootstrap/hub-services.js';

const input = z
  .object({
    version_id: z.uuid(),
    installation_option_id: z.string().min(1),
    client: z.string().min(1).max(64),
    scope: z.enum(['project', 'user']).default('project'),
  })
  .strict();

/**
 * 生成客户端 MCP 配置文本。远程安装项按绑定交付共享密钥，其他秘密请求头引用环境变量。
 * stdio 安装项输出 `npx -y <pkg>@<version>`，平台自身不会运行它。
 * 上游声明里凡带模板变量、秘密或客户端表达式（`${}`、`%VAR%`、`{env:}`、Pi 的 `!` 前缀）的值，
 * 一律拒绝而不是猜测展开，避免把未审阅的值升级成命令执行。
 * 失败抛 `HubError` 422：`NOT_MCP`、`UNSUPPORTED_CLIENT`、`UNSUPPORTED_INSTALLATION_OPTION`、
 * `UNSUPPORTED_CLIENT_EXPRESSION`、`UNSUPPORTED_VARIABLE`、`UNSUPPORTED_HEADER_TEMPLATE` 等。
 * 共享密钥随授权安装配置交付，读取权限和密钥绑定在同一事务中核对。
 */
export async function createClientConfiguration(
  hub: HubServices,
  p: Principal | null,
  body: unknown,
) {
  const b = input.parse(body);
  const {
    version: v,
    asset: a,
    option,
    sharedHeaders,
  } = await hub.mcpKeys.installation(p, b.version_id, b.installation_option_id);
  if (a.kind !== 'mcp') fail(422, 'NOT_MCP', '该版本不是 MCP');
  const parsedClient = agentClientSchema.safeParse(b.client);
  if (!parsedClient.success)
    fail(422, 'UNSUPPORTED_CLIENT', '该客户端尚未支持配置生成', {
      version_id: v.id,
      server_json: v.metadata.server_json,
      installation_options: v.metadata.installation_options,
    });
  const client = parsedClient.data;
  if (!option || !option.supported)
    fail(422, 'UNSUPPORTED_INSTALLATION_OPTION', '该安装项尚不支持生成配置');
  const required_variables: {
    name: string;
    secret: boolean;
    instruction: string;
  }[] = [];
  const notes = [
    '配置仅输出；由使用者审阅后在客户端连接，Hub 不运行目标服务。',
    agentClients[client].note,
  ];
  const config: McpClientServerRecord = {};
  const literal = (value: string) => {
    // 上游声明的固定值不能被目标客户端再次解释为环境变量或文件读取。
    const expression =
      client === 'opencode'
        ? /\{(?:env|file):/
        : client === 'gemini-cli'
          ? /\$\{|\$[A-Za-z_]|%[A-Za-z_][A-Za-z0-9_]*%/
          : /\$\{/;
    if (client !== 'codex' && expression.test(value))
      fail(422, 'UNSUPPORTED_CLIENT_EXPRESSION', '固定值包含客户端表达式，需要显式配置');
    return value;
  };
  const variable = (name: string, secret = true) => {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name))
      fail(422, 'UNSUPPORTED_VARIABLE', '变量名称不适合客户端环境变量');
    if (!required_variables.some((v) => v.name === name))
      required_variables.push({
        name,
        secret,
        instruction: `在启动客户端的本地环境设置 ${name}；不要提交真实值`,
      });
    return name;
  };
  if (option.kind === 'remote') {
    if (option.type !== 'streamable-http')
      fail(422, 'UNSUPPORTED_TRANSPORT', '仅支持 Streamable HTTP 远程安装项');
    if (Object.keys(option.variables ?? {}).length)
      fail(
        422,
        'UNSUPPORTED_URL_VARIABLE',
        'URL 模板需要用户选择具体参数，当前不能生成可直接使用的配置',
      );
    config.url = literal(option.url!);
    const headers: Record<string, string> = {};
    const envHeaders: Record<string, string> = {};
    for (const h of option.headers ?? []) {
      const shared = sharedHeaders.get(h.name.toLowerCase());
      if (shared !== undefined) {
        headers[h.name] = literal(shared);
        continue;
      }
      if (h.value) literal(h.value);
      if (h.isSecret || (h.variables && Object.keys(h.variables).length)) {
        const vars = Object.keys(h.variables ?? {});
        if (vars.length > 1)
          fail(422, 'UNSUPPORTED_HEADER_TEMPLATE', '包含多个变量的 Header 需要显式客户端配置');
        const name = variable(
          vars.length === 1 ? vars[0] : h.name.toUpperCase().replace(/-/g, '_'),
        );
        if (h.value && (vars.length === 0 || !h.value.includes(`{${name}}`)))
          fail(422, 'UNSUPPORTED_HEADER_TEMPLATE', '秘密 Header 必须引用已声明的变量');
        if (client === 'codex') {
          if (h.name.toLowerCase() === 'authorization' && h.value === `Bearer {${name}}`)
            config.bearer_token_env_var = name;
          else if (!h.value || h.value === `{${name}}`) envHeaders[h.name] = name;
          else fail(422, 'UNSUPPORTED_HEADER_TEMPLATE', '此客户端不能安全展开该 Header 模板');
        } else {
          const ref = clientEnvironmentReference(client, name);
          headers[h.name] = (h.value ?? `{${name}}`).replaceAll(`{${name}}`, ref);
        }
      } else if (h.value) headers[h.name] = h.value;
      else if (h.isRequired) fail(422, 'MISSING_HEADER_VALUE', '必填非秘密 Header 缺少固定值');
    }
    if (Object.keys(headers).length) config.headers = headers;
    if (Object.keys(envHeaders).length) config.env_http_headers = envHeaders;
    if (sharedHeaders.size)
      notes.push('配置内含 Hub 共享密钥。请保存到客户端私有配置，密钥轮换后重新获取配置。');
  } else {
    if (
      option.registryType !== 'npm' ||
      !option.identifier ||
      !option.version ||
      option.transport?.type !== 'stdio' ||
      !/^(?:@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/i.test(option.identifier)
    )
      fail(422, 'UNSUPPORTED_INSTALLATION_OPTION', '仅支持标准 npm 固定版本 stdio 安装项');
    if (option.runtimeArguments?.length)
      fail(422, 'UNSUPPORTED_RUNTIME_ARGUMENTS', '自定义运行时参数需要独立客户端适配');
    config.command = 'npx';
    config.args = ['-y', `${option.identifier}@${option.version}`];
    for (const arg of option.packageArguments ?? []) {
      if ((arg.variables && Object.keys(arg.variables).length) || arg.isSecret || !arg.value)
        fail(422, 'UNSUPPORTED_PACKAGE_ARGUMENT', '可变包参数需要显式配置，不能生成猜测参数');
      if (arg.type === 'named') config.args.push(literal(arg.name));
      config.args.push(literal(String(arg.value)));
    }
    const env: Record<string, string> = {};
    const pass: string[] = [];
    for (const e of option.environmentVariables ?? []) {
      if (Object.keys(e.variables ?? {}).length)
        fail(422, 'UNSUPPORTED_ENV_TEMPLATE', '环境变量模板需要显式配置，不能忽略模板或猜测展开值');
      if (e.isSecret || !e.value) {
        const name = variable(e.name, !!e.isSecret);
        if (client === 'codex') pass.push(name);
        else env[name] = clientEnvironmentReference(client, name);
      } else env[e.name] = literal(e.value);
    }
    if (Object.keys(env).length) config.env = env;
    if (pass.length) config.env_vars = pass;
    notes.push('stdio 在使用者机器启动；平台不会执行 npx。上游依赖树完整性未验证。');
  }
  // Pi 会把 ! 开头的 Header / env 当作命令求值，不能把普通声明值升级为执行。
  if (
    client === 'pi' &&
    [...Object.values(config.headers ?? {}), ...Object.values(config.env ?? {})].some((value) =>
      value.startsWith('!'),
    )
  )
    fail(422, 'UNSUPPORTED_CLIENT_VALUE', 'Pi 的命令求值需要独立审阅，不能作为普通变量值生成');
  return {
    version_id: v.id,
    installation_option_id: option.option_id,
    client: b.client,
    scope: b.scope,
    ...renderMcpClientConfiguration(client, a.slug, config, b.scope),
    required_variables,
    notes,
    runtime_client_verification: false as const,
  };
}
