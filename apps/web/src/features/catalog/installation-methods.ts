import { agentClients, shellArgument, type AgentClient } from '@capability-hub/contracts';
import type { AssetView } from './asset-view.js';

/** 受支持的 Agent 客户端标识，决定 Skill 安装目录与 MCP 配置格式。 */
export type InstallationClient = AgentClient;

/** 只展示当前 CLI 和 Hub MCP 已实现的操作；公开与否取视图给出的判定，不单看发布受众。 */
export function installationMethods(view: AssetView) {
  const { asset, publicReadable } = view;
  const options = asset.installation_options.filter((option) => option.supported);
  return {
    publicResource: publicReadable,
    conversation: publicReadable && !options.some((option) => option.has_shared_key),
    cli:
      asset.kind === 'skill'
        ? ('skill-install' as const)
        : options.length && view.currentReadable
          ? ('mcp-config' as const)
          : null,
    hubMcp:
      asset.kind === 'skill'
        ? ('skill-read' as const)
        : options.length
          ? ('mcp-config' as const)
          : null,
    options,
  };
}

function pinnedVersionArgs(versionLabel: string, origin: string): string {
  return `--version ${shellArgument(versionLabel)} --url ${shellArgument(new URL(origin).origin)}`;
}

/** 单项与批量安装均锁定展示版本及当前 Hub；不读取凭据，也不授权替换本地目录。 */
export function cliSkillCommand(
  slug: string,
  versionLabel: string,
  origin: string,
  client: InstallationClient,
): string {
  return `capability-hub add ${shellArgument(slug)} ${pinnedVersionArgs(versionLabel, origin)} --to ${agentClients[client].skillDirectory}`;
}

/** 清单保留完整发布标签，由目标 Agent 在同一 Hub 按名称解析；网页不预取 ID 或票据。 */
export function agentSkillInstallPrompt(
  skills: readonly { slug: string; version_label: string }[],
  origin: string,
  client: InstallationClient,
): string {
  return [
    `请用已授权的 Capability Hub MCP（${new URL(origin).origin}）预览以下 Skill：`,
    ...skills.map(({ slug, version_label }) => `- ${slug}@${version_label}`),
    '',
    `逐项用 get_asset_version 按名称和完整版本号查找，再用匹配版本的 ID 调用 install_skill（client: ${client}）。无法获取的版本请指出，不要换成最新版。`,
    `先预览当前项目 ${agentClients[client].skillDirectory} 的文件变更（CLI 加 --dry-run），经我确认再安装。手动安装须校验摘要；保留已有目录，不执行脚本，不显示凭据或票据地址。`,
  ].join('\n');
}

/**
 * 版本固定为视图展示的发布，命令可直接粘贴执行；所有变量参数都做单引号转义。
 * Skill 只把 slug 与 `--to` 目录拼进命令，故 `optionId` 被忽略；MCP 必须给出已受支持的
 * `optionId`，否则抛出「请选择受支持的 MCP 安装项」。
 */
export function cliResourceCommand(
  view: AssetView,
  origin: string,
  optionId?: string,
  client: InstallationClient = 'codex',
): string {
  const { asset, release } = view;
  if (asset.kind === 'skill') {
    const command = cliSkillCommand(asset.slug, release.version_label, origin, client);
    return `# 预览\n${command} --dry-run\n\n# 安装\n${command}`;
  }
  const option = requireMcpOption(view, optionId);
  const base = pinnedVersionArgs(release.version_label, origin);
  return `capability-hub mcp-config ${shellArgument(asset.slug)} ${base} --client ${client} --option ${shellArgument(option.option_id)}${option.has_shared_key ? ' --scope user' : ''}`;
}

function requireMcpOption(view: AssetView, optionId: string | undefined) {
  const option = installationMethods(view).options.find((option) => option.option_id === optionId);
  if (view.asset.kind !== 'mcp' || !option) throw new Error('请选择受支持的 MCP 安装项');
  return option;
}

/**
 * 含共享密钥的安装项使用用户配置，并要求 Agent 隐去对话中的密钥。
 * `optionId` 不受支持时与 {@link cliResourceCommand} 一样抛错，不返回兜底文案。
 */
export function hubMcpConfigurationPrompt(
  view: AssetView,
  optionId: string,
  client: InstallationClient,
): string {
  const option = requireMcpOption(view, optionId);
  return `请使用已配置的 Capability Hub MCP，为「${view.asset.slug}」生成 ${client} 的${option.has_shared_key ? '用户' : '项目'}配置。\n调用 get_mcp_config，参数：\n${JSON.stringify(
    {
      version_id: view.release.version_id,
      installation_option_id: optionId,
      client,
      scope: option.has_shared_key ? 'user' : 'project',
    },
    null,
    2,
  )}\n获取配置后，按所选客户端约定合并配置，保留已有条目。隐藏对话中的密钥，仅对 required_variables 列出的变量说明本地设置步骤，再重新加载客户端。请区分配置生成、配置写入和连接验证的实际结果。`;
}
