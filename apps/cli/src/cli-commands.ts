import { connectAgent, bridgeAgent, checkConnection } from './connection.js';
import { randomBytes } from 'node:crypto';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { sha256 } from '@capability-hub/domain/canonical';
import {
  agentClientIds,
  agentClients,
  agentClientSchema,
  agentConfigurationScopeSchema,
  hubMcpConnectionGuide,
  needsAssistantConfigFile,
  assetSlugSchema,
} from '@capability-hub/contracts';
import {
  hubUrl,
  loadCredentials,
  resolveConsumerCredentials,
  saveCredentials,
} from './credentials.js';
import { HubApiClient, terminalText } from './api-client.js';
import { install } from './install.js';
import {
  assetSchema,
  searchSchema,
  versionsSchema,
  optionsSchema,
  configurationSchema,
  manifestResponseSchema,
  loginResponseSchema,
  pollResponseSchema,
} from './response-schemas.js';
import type { CliUi } from './cli-ui.js';

/** Commander 选项使用驼峰字段；version 只表示资源版本。 */
export interface CliOptions {
  url?: string;
  configDir?: string;
  interactive?: boolean;
  client?: string;
  scope?: string;
  method?: 'oauth' | 'assistant' | 'token';
  contribute?: boolean;
  browser?: boolean;
  configFile?: string;
  version?: string;
  to?: string;
  option?: string;
  conversation?: boolean;
  dryRun?: boolean;
  replace?: boolean;
  json?: boolean;
}

/**
 * 交互输入和命令行参数走同一校验；读取凭据仍由 resolveConsumerCredentials 隔离实例。
 * 配置、JSON 和安装结果只写 stdout，提示与进度只写 stderr。
 */
export async function runCommand(
  command: string,
  args: readonly string[],
  flags: CliOptions,
  ui: CliUi,
): Promise<void> {
  const guided = ui.interactive && !flags.client;
  if (['connect', 'status', 'bridge', 'login', 'hub-config'].includes(command)) {
    flags.url = await ui.input(flags.url, '--url', 'Hub 的 HTTP(S) 根地址', (value) => {
      try {
        hubUrl(value);
        return undefined;
      } catch {
        return '请输入 HTTP(S) 根地址，不含凭据、路径、查询或空白';
      }
    });
  }
  if (['connect', 'status', 'bridge', 'hub-config', 'mcp-config'].includes(command)) {
    flags.client ??= await ui.choose(
      '--client',
      '选择目标 Agent 客户端',
      agentClientIds.map((value) => ({ value, label: agentClients[value].label, hint: value })),
    );
  }
  if (guided && !flags.scope && ['connect', 'hub-config', 'mcp-config'].includes(command))
    flags.scope = await ui.choose('--scope', '配置保存在哪个范围？', [
      { value: 'project', label: '当前项目', hint: process.cwd() },
      { value: 'user', label: '当前用户', hint: '供此用户的多个项目使用' },
    ]);
  const scope = agentConfigurationScopeSchema.parse(flags.scope ?? 'project');
  if (command === 'hub-config') {
    const client = agentClientSchema.parse(flags.client);
    const guide = hubMcpConnectionGuide(
      client,
      hubUrl(flags.url!),
      scope,
      flags.method,
      flags.contribute ? 'contribute' : 'read',
    );
    process.stdout.write((flags.conversation ? guide.installation_prompt : guide.text) + '\n');
    ui.message(`配置位置：${guide.target_file}\n${guide.notes.join('\n')}`);
    return;
  }
  if (['connect', 'bridge', 'status'].includes(command)) {
    const url = hubUrl(flags.url!);
    const client = agentClientSchema.parse(flags.client);
    const directory = flags.configDir
      ? resolve(flags.configDir)
      : join(homedir(), '.config', 'capability-hub');
    if (command === 'connect') {
      const configFile = needsAssistantConfigFile(client, scope)
        ? await ui.input(flags.configFile, '--config-file', '客户端用户配置文件的实际路径')
        : flags.configFile;
      await connectAgent(
        {
          url,
          client,
          directory,
          scope,
          configFile,
          replace: flags.replace,
          contribute: !!flags.contribute,
          noBrowser: flags.browser === false,
        },
        ui,
      );
    } else if (command === 'bridge') await bridgeAgent(url, directory, client);
    else await checkConnection(url, directory, client, ui);
    return;
  }
  const credentialsFile = join(
    flags.configDir ? resolve(flags.configDir) : join(homedir(), '.config', 'capability-hub'),
    'auth.json',
  );
  if (command === 'login') {
    const api = new HubApiClient(hubUrl(flags.url!));
    const verifier = randomBytes(32).toString('base64url');
    const login = await api.json('/auth/cli/request', loginResponseSchema, {
      challenge: sha256(verifier),
    });
    const verification = new URL(login.verification_uri);
    if (
      verification.origin !== api.url ||
      verification.pathname !== '/connect' ||
      verification.search !== '?code=' + login.user_code ||
      verification.hash ||
      verification.username ||
      verification.password
    )
      throw new Error('Hub 返回了无效的浏览器批准地址');
    ui.message(`请在浏览器登录并批准：${verification.toString()}\n核对授权码：${login.user_code}`);
    await ui.task('等待浏览器批准登录', 'CLI 登录完成', async () => {
      const expires = Date.now() + login.expires_in * 1000;
      while (Date.now() < expires) {
        await delay(2000);
        const poll = await api.json('/auth/cli/poll', pollResponseSchema, {
          device_code: login.device_code,
          verifier,
        });
        if (poll.state === 'complete') {
          await saveCredentials(credentialsFile, { url: api.url, token: poll.token });
          return;
        }
      }
      throw new Error('登录等待超时，请重新发起');
    });
    ui.message('已登录。令牌保存在用户专用 0600 文件。\n下一步：capability-hub search <关键词>');
    return;
  }
  let slug: string | undefined;
  if (command === 'add' || command === 'mcp-config') {
    slug = await ui.input(
      args[0],
      'NAME',
      command === 'add' ? 'Skill 资源名称' : 'MCP 资源名称',
      (value) =>
        assetSlugSchema.safeParse(value).success
          ? undefined
          : '资源名称须为小写字母、数字及连字符，最长 64 个字符',
    );
    if (flags.version !== undefined || !ui.interactive)
      flags.version = await ui.input(flags.version, '--version', '资源版本', validateVersion);
    if (command === 'add')
      flags.to = await ui.input(flags.to, '--to', '安装父目录（将创建该目录下的资源子目录）');
  }
  const credentials = await resolveConsumerCredentials({
    url: flags.url,
    environmentToken: process.env.CAPABILITY_HUB_TOKEN,
    load: async () => {
      try {
        return await loadCredentials(credentialsFile);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT')
          throw new Error(
            '尚未登录 CLI。请运行 capability-hub login --url <URL>，或设置 CAPABILITY_HUB_TOKEN 并显式提供 --url。',
            { cause: error },
          );
        throw error;
      }
    },
  });
  const api = new HubApiClient(credentials.url, credentials.token);
  if (command === 'search') {
    const result = await ui.task('搜索可见资源', '搜索完成', () =>
      api.json('/api/assets?q=' + encodeURIComponent(args.join(' ')), searchSchema),
    );
    if (flags.json) process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    else {
      for (const asset of result.items)
        process.stdout.write(
          `${asset.slug}\t${asset.kind}\t${terminalText(asset.current_release.version_label)}\n  ${terminalText(asset.description)}\n`,
        );
      if (!result.items.length)
        ui.message('没有匹配的可见资源。请尝试更短的关键词，或检查当前账号的访问权限。');
      else if (ui.interactive)
        ui.message(
          `显示 ${result.items.length} / ${result.total} 个资源。\n安装 Skill：capability-hub add <名称> --version <版本> --to <目录>\n生成 MCP 配置：capability-hub mcp-config <名称> --version <版本> --client <客户端>`,
        );
    }
    return;
  }
  if (!slug) throw new Error('未知命令：' + terminalText(command));
  const asset = await api.json('/api/assets/' + slug, assetSchema);
  if (asset.slug !== slug) throw new Error('Hub 返回的资源名称与请求不一致');
  if (command === 'mcp-config' && asset.kind !== 'mcp')
    throw new Error('mcp-config 仅用于 MCP 资源');
  if (command === 'add' && asset.kind !== 'skill')
    throw new Error('add 只安装 Skill；MCP 请使用 mcp-config');
  const versions = await api.json(`/api/assets/${asset.asset_id}/versions`, versionsSchema);
  if (flags.version === undefined)
    flags.version = await ui.choose(
      '--version',
      '选择明确的资源版本',
      versions.map((version) => ({
        value: version.version_label,
        label: version.version_label,
        hint: version.version_id === asset.current_release.version_id ? '当前发布版本' : undefined,
      })),
    );
  const invalidVersion = validateVersion(flags.version);
  if (invalidVersion) throw new Error(invalidVersion);
  const version = versions.find((item) => item.version_label === flags.version);
  if (!version) throw new Error('指定版本不存在或无权访问');
  if (command === 'mcp-config') {
    if (!agentClientSchema.safeParse(flags.client).success)
      throw new Error(`需要 --client ${agentClientIds.join('|')}`);
    let option = flags.option;
    if (!option) {
      const full =
        asset.current_release.version_id === version.version_id
          ? asset
          : await api.json(`/api/versions/${version.version_id}/mcp-options`, optionsSchema);
      const supported = full.installation_options.filter((item) => item.supported);
      option =
        supported.length === 1
          ? supported[0].option_id
          : await ui.choose(
              '--option',
              '选择 MCP 安装项',
              supported.map((item) => ({ value: item.option_id, label: item.option_id })),
            );
    }
    const configuration = await api.json('/api/mcp-config', configurationSchema, {
      version_id: version.version_id,
      installation_option_id: option,
      client: flags.client,
      scope,
    });
    process.stdout.write(configuration.text + '\n');
    ui.message(`配置位置：${terminalText(configuration.target_file)}`);
    for (const variable of configuration.required_variables)
      ui.message(terminalText(variable.instruction));
    for (const note of configuration.notes) ui.message(terminalText(note));
    return;
  }
  if (!flags.to) throw new Error('add 必须提供明确 --to PATH');
  const path = `/api/versions/${version.version_id}`;
  const manifest = await api.json(path + '/manifest', manifestResponseSchema);
  if (ui.interactive)
    ui.message(
      `${flags.dryRun ? '预览' : '安装'}：${asset.slug} @ ${terminalText(version.version_label)}\n目标：${terminalText(resolve(flags.to, asset.slug))}`,
    );
  const archive = await ui.task('下载 Skill 归档', '归档下载完成，开始校验', () =>
    api.archive(path + '/archive'),
  );
  const result = await install({
    slug: asset.slug,
    to: flags.to,
    manifest: manifest.manifest,
    content_digest: manifest.content_digest,
    artifact_digest: manifest.artifact_digest,
    archive,
    source: {
      hub_url: credentials.url,
      asset_id: asset.asset_id,
      version_id: version.version_id,
      release_id: manifest.release_id,
    },
    dryRun: flags.dryRun,
    replace: flags.replace,
    beforeCommit: async () => {
      await api.json(path + '/manifest', manifestResponseSchema);
    },
  });
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  if (ui.interactive)
    ui.message(
      flags.dryRun
        ? '预览完成，未写入文件。去掉 --dry-run 可安装。'
        : 'Skill 已校验并安装；请在 Agent 中重新加载技能。',
    );
}

function validateVersion(value: string): string | undefined {
  return !value.trim() || value.length > 256 || /[\p{Cc}]/u.test(value)
    ? '需要明确的资源版本，最长 256 个字符且不能含控制字符'
    : undefined;
}
