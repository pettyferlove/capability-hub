import { connectAgent, bridgeAgent, checkConnection } from './connection.js';
import { randomBytes } from 'node:crypto';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import { sha256 } from '@capability-hub/domain/canonical';
import {
  agentClientIds,
  agentClientSchema,
  agentConfigurationScopeSchema,
  hubMcpConnectionGuide,
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

const help = `Capability Hub\n\n  connect --url URL --client CLIENT [--scope project|user] [--contribute] [--no-browser] [--config-file PATH] [--replace]\n  bridge --url URL --client CLIENT\n  status --url URL --client CLIENT\n  login --url URL\n  search QUERY [--json]\n  add NAME --version VERSION --to PATH [--dry-run] [--replace]\n  hub-config --url URL --client CLIENT [--scope project|user] [--conversation]\n  mcp-config NAME --version VERSION --client ${agentClientIds.join('|')} [--option ID] [--scope project|user]\n\n读取命令可设置 CAPABILITY_HUB_TOKEN 并明确提供 --url URL。未设置环境令牌时使用浏览器批准后保存的凭据。\n所有命令可用 --config-dir PATH 指定独立凭据目录。add 只写明确路径，不执行内容。\n`;

/**
 * CLI 入口。读取类命令支持 `CAPABILITY_HUB_TOKEN` + 显式 `--url`，否则回落到浏览器批准后保存的凭据
 * （`--config-dir` 可换目录）；两种来源互斥，避免把令牌发往另一实例。
 * 写文件的只有 `add`，且必须给出显式 `--to`：只解包到指定目录，内容从不执行。
 * 失败一律抛错由调用方转成退出码，不在此处 `process.exit`，便于测试直接调用。
 */
export async function runCli(arguments_: readonly string[] = process.argv.slice(2)): Promise<void> {
  const { positionals, values: flags } = parseArgs({
    args: [...arguments_],
    allowPositionals: true,
    options: {
      url: { type: 'string' },
      method: { type: 'string' },
      contribute: { type: 'boolean' },
      'no-browser': { type: 'boolean' },
      'config-file': { type: 'string' },
      version: { type: 'string' },
      to: { type: 'string' },
      client: { type: 'string' },
      option: { type: 'string' },
      scope: { type: 'string' },
      conversation: { type: 'boolean' },
      'dry-run': { type: 'boolean' },
      replace: { type: 'boolean' },
      help: { type: 'boolean' },
      json: { type: 'boolean' },
      'config-dir': { type: 'string' },
    },
  });
  const [command, ...args] = positionals;
  if (flags.help || !command) {
    process.stdout.write(help);
    return;
  }
  if (
    !['login', 'search', 'add', 'mcp-config', 'hub-config', 'connect', 'bridge', 'status'].includes(
      command,
    )
  )
    throw new Error('未知命令：' + terminalText(command));
  if (flags.conversation && command !== 'hub-config')
    throw new Error('--conversation 仅用于 hub-config');
  if (flags.scope && !['hub-config', 'mcp-config', 'connect'].includes(command))
    throw new Error('--scope 仅用于 MCP 配置');
  const scope = agentConfigurationScopeSchema.parse(flags.scope ?? 'project');
  if (flags.method && !['oauth', 'assistant', 'token'].includes(flags.method))
    throw new Error('连接方式无效');
  if (command === 'hub-config') {
    if (!flags.url) throw new Error('hub-config 需要 --url');
    const client = agentClientSchema.parse(flags.client);
    const guide = hubMcpConnectionGuide(
      client,
      hubUrl(flags.url),
      scope,
      flags.method as 'oauth' | 'assistant' | 'token' | undefined,
      flags.contribute ? 'contribute' : 'read',
    );
    process.stdout.write((flags.conversation ? guide.installation_prompt : guide.text) + '\n');
    process.stderr.write(`配置位置：${guide.target_file}\n${guide.notes.join('\n')}\n`);
    return;
  }
  if (['connect', 'bridge', 'status'].includes(command)) {
    if (!flags.url) throw new Error(command + ' 需要 --url');
    const url = hubUrl(flags.url);
    const client = agentClientSchema.parse(flags.client);
    const directory = flags['config-dir']
      ? resolve(flags['config-dir'])
      : join(homedir(), '.config', 'capability-hub');
    if (command === 'connect')
      await connectAgent({
        url,
        client,
        directory,
        scope,
        configFile: flags['config-file'],
        replace: flags.replace,
        contribute: !!flags.contribute,
        noBrowser: !!flags['no-browser'],
      });
    else if (command === 'bridge') await bridgeAgent(url, directory, client);
    else await checkConnection(url, directory, client);
    return;
  }
  const credentialsFile = join(
    flags['config-dir']
      ? resolve(flags['config-dir'])
      : join(homedir(), '.config', 'capability-hub'),
    'auth.json',
  );
  if (command === 'login') {
    if (!flags.url) throw new Error('login 需要 --url');
    const api = new HubApiClient(hubUrl(flags.url));
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
    process.stderr.write(
      `请在浏览器登录并批准：${verification.toString()}\n核对授权码：${login.user_code}\n`,
    );
    const expires = Date.now() + login.expires_in * 1000;
    while (Date.now() < expires) {
      await delay(2000);
      const poll = await api.json('/auth/cli/poll', pollResponseSchema, {
        device_code: login.device_code,
        verifier,
      });
      if (poll.state === 'complete') {
        await saveCredentials(credentialsFile, { url: api.url, token: poll.token });
        process.stderr.write('已登录。令牌保存在用户专用 0600 文件。\n');
        return;
      }
    }
    throw new Error('登录等待超时，请重新发起');
  }
  const credentials = await resolveConsumerCredentials({
    url: flags.url,
    environmentToken: process.env.CAPABILITY_HUB_TOKEN,
    load: () => loadCredentials(credentialsFile),
  });
  const api = new HubApiClient(credentials.url, credentials.token);
  if (command === 'search') {
    const result = await api.json(
      '/api/assets?q=' + encodeURIComponent(args.join(' ')),
      searchSchema,
    );
    if (flags.json) process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    else {
      for (const asset of result.items)
        process.stdout.write(
          `${asset.slug}\t${asset.kind}\t${terminalText(asset.current_release.version_label)}\n  ${terminalText(asset.description)}\n`,
        );
      if (!result.items.length) process.stderr.write('没有匹配的可见资源。\n');
    }
    return;
  }
  const slug = assetSlugSchema.safeParse(args[0]);
  if (
    !slug.success ||
    !flags.version ||
    !flags.version.trim() ||
    flags.version.length > 256 ||
    /[\p{Cc}]/u.test(flags.version)
  )
    throw new Error('需要有效资源名称及明确 --version');
  const asset = await api.json('/api/assets/' + slug.data, assetSchema);
  if (asset.slug !== slug.data) throw new Error('Hub 返回的资源名称与请求不一致');
  const versions = await api.json(`/api/assets/${asset.asset_id}/versions`, versionsSchema);
  const version = versions.find((item) => item.version_label === flags.version);
  if (!version) throw new Error('指定版本不存在或无权访问');
  if (command === 'mcp-config') {
    if (asset.kind !== 'mcp') throw new Error('mcp-config 仅用于 MCP 资源');
    if (!agentClientSchema.safeParse(flags.client).success)
      throw new Error(`需要 --client ${agentClientIds.join('|')}`);
    let option = flags.option;
    if (!option) {
      const full =
        asset.current_release.version_id === version.version_id
          ? asset
          : await api.json(`/api/versions/${version.version_id}/mcp-options`, optionsSchema);
      const supported = full.installation_options.filter((item) => item.supported);
      if (supported.length !== 1)
        throw new Error(
          '请用 --option 明确选择：' +
            supported.map((item) => terminalText(item.option_id)).join(', '),
        );
      option = supported[0].option_id;
    }
    const configuration = await api.json('/api/mcp-config', configurationSchema, {
      version_id: version.version_id,
      installation_option_id: option,
      client: flags.client,
      scope,
    });
    process.stdout.write(configuration.text + '\n');
    process.stderr.write(`配置位置：${terminalText(configuration.target_file)}\n`);
    for (const variable of configuration.required_variables)
      process.stderr.write(terminalText(variable.instruction) + '\n');
    for (const note of configuration.notes) process.stderr.write(terminalText(note) + '\n');
    return;
  }
  if (asset.kind !== 'skill') throw new Error('add 只安装 Skill；MCP 请使用 mcp-config');
  if (!flags.to) throw new Error('add 必须提供明确 --to PATH');
  const path = `/api/versions/${version.version_id}`;
  const manifest = await api.json(path + '/manifest', manifestResponseSchema);
  const result = await install({
    slug: asset.slug,
    to: flags.to,
    manifest: manifest.manifest,
    content_digest: manifest.content_digest,
    artifact_digest: manifest.artifact_digest,
    archive: await api.archive(path + '/archive'),
    source: {
      hub_url: credentials.url,
      asset_id: asset.asset_id,
      version_id: version.version_id,
      release_id: manifest.release_id,
    },
    dryRun: flags['dry-run'],
    replace: flags.replace,
    beforeCommit: async () => {
      await api.json(path + '/manifest', manifestResponseSchema);
    },
  });
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}
