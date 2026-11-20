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
import { HubApiClient, HubApiError, terminalText } from './api-client.js';
import {
  install,
  preflightInstall,
  validateInstallManifest,
  type InstallResult,
} from './install.js';
import {
  assetSchema,
  searchSchema,
  versionsSchema,
  optionsSchema,
  configurationSchema,
  manifestResponseSchema,
  installTicketSchema,
  loginResponseSchema,
  pollResponseSchema,
} from './response-schemas.js';
import type { CliUi } from './cli-ui.js';
import { runFeedback, type FeedbackOptions } from './feedback.js';
import { outdated } from './outdated.js';
import { readSkillAsset } from './skill-versions.js';

/** Commander 选项使用驼峰字段；version 只表示资源版本。 */
export interface CliOptions extends FeedbackOptions {
  url?: string;
  configDir?: string;
  interactive?: boolean;
  animation?: boolean;
  client?: string;
  scope?: string;
  method?: 'oauth' | 'assistant' | 'token';
  contribute?: boolean;
  browser?: boolean;
  configFile?: string;
  version?: string;
  ticket?: string;
  to?: string;
  option?: string;
  conversation?: boolean;
  dryRun?: boolean;
  replace?: boolean;
  json?: boolean;
  exitCode?: boolean;
  failOnModified?: boolean;
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
  optionNames: readonly string[] = [],
): Promise<number | undefined> {
  if (command === 'feedback' || command.startsWith('feedback ')) {
    await runFeedback(command, args, flags, ui);
    return;
  }
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
    ui.note('接入说明', `配置位置  ${guide.target_file}\n\n${guide.notes.join('\n')}`);
    if (ui.interactive)
      ui.outro(
        flags.conversation
          ? '接入说明已生成，可复制给目标 Agent。'
          : '配置已生成，请按上方说明完成接入。',
      );
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
    } else if (command === 'bridge') await bridgeAgent(url, directory, client, optionNames);
    else await checkConnection(url, directory, client, ui);
    return;
  }
  if (command === 'add' && flags.ticket !== undefined) {
    if (args[0] !== undefined || flags.version !== undefined)
      throw new Error('--ticket 不能与 NAME 或 --version 同时使用');
    await installTicket(flags.ticket, flags, ui);
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
    ui.note('CLI 授权', `请在浏览器登录，核对授权码后批准。\n\n授权码  ${login.user_code}`);
    ui.link(verification.toString());
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
    ui.outro('已登录 · 下一步：capability-hub search <关键词>');
    return;
  }
  const getCredentials = () =>
    resolveConsumerCredentials({
      url: flags.url,
      environmentToken: process.env.CAPABILITY_HUB_TOKEN,
      allowAnonymous: command === 'add' || command === 'outdated',
      load: () => loadCredentials(credentialsFile),
    });
  if (command === 'outdated') return await outdated(args, flags, getCredentials);
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
  const credentials = await getCredentials();
  const api = new HubApiClient(credentials.url, credentials.token);
  if (command === 'search') {
    const result = await ui.task('搜索可见资源', '搜索完成', () =>
      api.json('/api/assets?q=' + encodeURIComponent(args.join(' ')), searchSchema),
    );
    if (flags.json) process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    else {
      for (const asset of result.items)
        ui.resource(asset.slug, asset.kind, asset.current_release.version_label, asset.description);
      if (!result.items.length)
        ui.outro('没有匹配的可见资源。请尝试更短的关键词，或检查当前账号的访问权限。');
      else if (ui.interactive) {
        ui.note(
          '使用资源',
          '安装 Skill\ncapability-hub add <名称> --version <版本> --to <目录>\n\n生成 MCP 配置\ncapability-hub mcp-config <名称> --version <版本> --client <客户端>',
        );
        ui.outro(`显示 ${result.items.length} / ${result.total} 个资源`);
      }
    }
    return;
  }
  if (!slug) throw new Error('未知命令：' + terminalText(command));
  const anonymous = command === 'add' && credentials.token === undefined;
  if (anonymous) ui.message('未找到 CLI 登录，按匿名身份读取公开资源');
  async function readResource<T>(request: Promise<T>): Promise<T> {
    try {
      return await request;
    } catch (error) {
      if (anonymous && error instanceof HubApiError && error.status === 404)
        throw new Error(
          `未找到可匿名访问的资源 ${slug}；团队资源请先运行 capability-hub login --url ${api.url}`,
          { cause: error },
        );
      throw error;
    }
  }
  const installDetail = command === 'add' ? await readResource(readSkillAsset(api, slug)) : null;
  const asset =
    installDetail?.asset ?? (await readResource(api.json('/api/assets/' + slug, assetSchema)));
  if (asset.slug !== slug) throw new Error('Hub 返回的资源名称与请求不一致');
  if (command === 'mcp-config' && asset.kind !== 'mcp')
    throw new Error('mcp-config 仅用于 MCP 资源');
  if (command === 'add' && asset.kind !== 'skill')
    throw new Error('add 只安装 Skill；MCP 请使用 mcp-config');
  const versions = await readResource(
    api.json(
      installDetail?.historyPath ?? `/api/assets/${asset.asset_id}/versions`,
      versionsSchema,
    ),
  );
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
    ui.note(
      '客户端配置',
      [
        `配置位置  ${terminalText(configuration.target_file)}`,
        ...configuration.required_variables.map((variable) => terminalText(variable.instruction)),
        ...configuration.notes.map(terminalText),
      ].join('\n\n'),
    );
    if (ui.interactive) ui.outro('配置已生成，请按上方说明在 Agent 中完成配置。');
    return;
  }
  if (!flags.to) throw new Error('add 必须提供明确 --to PATH');
  const path = `/api/versions/${version.version_id}`;
  const manifest = await readResource(api.json(path + '/manifest', manifestResponseSchema));
  showInstallTarget(ui, flags.to, asset.slug, version.version_label, flags.dryRun);
  const archive = await readResource(downloadSkillArchive(ui, api, path + '/archive'));
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
      version_label: version.version_label,
      release_id: manifest.release_id,
    },
    dryRun: flags.dryRun,
    replace: flags.replace,
    beforeCommit: async () => {
      await readResource(api.json(path + '/manifest', manifestResponseSchema));
    },
  });
  printInstallResult(ui, result);
  showLatestVersion(ui, version.version_id, asset.current_release);
}

async function installTicket(ticket: string, flags: CliOptions, ui: CliUi) {
  const to = flags.to;
  if (!to?.trim()) throw new Error('--ticket 必须提供明确 --to PATH');
  const { origin, pathname } = parseTicketUrl(ticket);
  if (flags.url !== undefined) {
    let specifiedOrigin: string;
    try {
      specifiedOrigin = hubUrl(flags.url);
    } catch {
      throw new Error('--url 必须是有效的 HTTP(S) 实例根地址');
    }
    if (specifiedOrigin !== origin) throw new Error('--url 与票据的 Hub 地址不一致');
  }
  const api = new HubApiClient(origin);
  const describe = async () => {
    const metadata = await readTicket(api.json(pathname, installTicketSchema));
    if (
      metadata.hub_url !== origin ||
      metadata.manifest.kind !== 'skill' ||
      validateVersion(metadata.version_label)
    )
      throw new Error('Hub 返回的安装票据元数据无效');
    validateInstallManifest(metadata);
    return metadata;
  };
  const metadata = await describe();
  if (!flags.dryRun && !metadata.archive_available) ticketUsed();
  const input = { ...metadata, to, dryRun: flags.dryRun, replace: flags.replace };
  const preview = await preflightInstall(input);
  showInstallTarget(ui, to, metadata.slug, metadata.version_label, flags.dryRun);
  if (preview) {
    printInstallResult(ui, preview);
    showLatestVersion(ui, metadata.version_id, metadata.latest_release);
    return;
  }
  const archive = await readTicket(downloadSkillArchive(ui, api, pathname + '/archive'));
  const result = await install({
    ...input,
    archive,
    source: {
      hub_url: origin,
      asset_id: metadata.asset_id,
      version_id: metadata.version_id,
      version_label: metadata.version_label,
      release_id: metadata.release_id,
    },
    beforeCommit: async () => {
      const current = await describe();
      if (
        current.asset_id !== metadata.asset_id ||
        current.slug !== metadata.slug ||
        current.version_id !== metadata.version_id ||
        current.version_label !== metadata.version_label ||
        current.release_id !== metadata.release_id ||
        current.content_digest !== metadata.content_digest ||
        current.artifact_digest !== metadata.artifact_digest
      )
        throw new Error('安装票据元数据已变更，请重新调用 install_skill');
    },
  });
  printInstallResult(ui, result);
  showLatestVersion(ui, metadata.version_id, metadata.latest_release);
}

function parseTicketUrl(value: string): URL {
  try {
    const raw = /^https?:\/\/[^/@?#]+(\/[^?#]*)$/i.exec(value);
    if (
      raw &&
      !/[\p{Cc}\p{Cf}\s\\]/u.test(value) &&
      /^\/api\/install-tickets\/[A-Za-z0-9_-]{43}$/.test(raw[1])
    ) {
      const url = new URL(value);
      if (url.pathname === raw[1]) return url;
    }
  } catch {
    // 解析错误可能包含原始票据地址。
  }
  throw new Error('--ticket 必须是有效的 HTTP(S) 安装票据地址');
}

/** 只把失效与已使用的票据转成重新签发的提示，其余错误保留原因。 */
async function readTicket<T>(request: Promise<T>): Promise<T> {
  try {
    return await request;
  } catch (error) {
    if (error instanceof HubApiError && error.code === 'INSTALL_TICKET_USED') ticketUsed(error);
    if (error instanceof HubApiError && error.code === 'INSTALL_TICKET_INVALID')
      throw new HubApiError(
        404,
        'INSTALL_TICKET_INVALID',
        '票据无效或已过期，请重新调用 install_skill',
        { cause: error },
      );
    throw error;
  }
}

function ticketUsed(cause?: HubApiError): never {
  throw new HubApiError(409, 'INSTALL_TICKET_USED', '票据已使用，请重新调用 install_skill', {
    cause,
  });
}

function showInstallTarget(ui: CliUi, to: string, slug: string, version: string, dryRun?: boolean) {
  if (ui.interactive)
    ui.note(
      dryRun ? '安装预览' : '安装 Skill',
      `资源名称  ${slug}\n资源版本  ${terminalText(version)}\n安装目录  ${terminalText(resolve(to, slug))}`,
    );
}

function showLatestVersion(
  ui: CliUi,
  installed: string,
  latest: { version_id: string; version_label: string } | null | undefined,
) {
  if (
    latest &&
    latest.version_id !== installed &&
    process.env.CAPABILITY_HUB_NO_UPDATE_NOTICE !== '1'
  )
    ui.message(`有更新的可读发布：${terminalText(latest.version_label)}。指定的固定版本不变。`);
}

function downloadSkillArchive(ui: CliUi, api: HubApiClient, path: string) {
  return ui.task('下载 Skill 归档', '归档下载完成，开始校验', (update) =>
    api.archive(
      path,
      ui.animated
        ? (received, total) => {
            const transferred = formatBytes(received);
            update(
              `下载 Skill 归档 · ${total === undefined ? transferred : `${transferred} / ${formatBytes(total)}`}`,
            );
          }
        : undefined,
    ),
  );
}

function printInstallResult(ui: CliUi, result: InstallResult) {
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  if (ui.interactive)
    ui.outro(
      result.dry_run
        ? '预览完成，未写入文件。去掉 --dry-run 可安装。'
        : 'Skill 已校验并安装；请在 Agent 中重新加载技能。',
    );
}

function formatBytes(value: number): string {
  return value < 1024 * 1024
    ? `${(value / 1024).toFixed(1)} KiB`
    : `${(value / (1024 * 1024)).toFixed(1)} MiB`;
}

function validateVersion(value: string): string | undefined {
  return !value.trim() || value.length > 256 || /[\p{Cc}]/u.test(value)
    ? '需要明确的资源版本，最长 256 个字符且不能含控制字符'
    : undefined;
}
