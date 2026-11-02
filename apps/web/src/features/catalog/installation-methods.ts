import { agentClients, type AgentClient } from '@capability-hub/contracts';
import type { AssetResponse } from '@capability-hub/contracts/http';

/** 受支持的 Agent 客户端标识，决定 Skill 安装目录与 MCP 配置格式。 */
export type InstallationClient = AgentClient;

/** 只展示当前 CLI 和 Hub MCP 已实现的操作。 */
export function installationMethods(asset: AssetResponse) {
  const publicResource = asset.current_release.distribution.audience.includes('public');
  const options = asset.installation_options.filter((option) => option.supported);
  return {
    publicResource,
    conversation: publicResource && !options.some((option) => option.has_shared_key),
    cli:
      asset.kind === 'skill'
        ? ('skill-install' as const)
        : options.length
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

const shellArgument = (value: string) => `'${value.replaceAll("'", "'\"'\"'")}'`;

/**
 * 会丢弃 `origin` 的路径与查询串，只保留协议与主机，避免把页面深链带进登录参数；
 * 参数经单引号转义，`origin` 非法时 `new URL` 直接抛错。
 */
export function cliLoginCommand(origin: string): string {
  return `capability-hub login --url ${shellArgument(new URL(origin).origin)}`;
}

/**
 * 版本固定为当前发布版，命令可直接粘贴执行；所有变量参数都做单引号转义。
 * Skill 只把 slug 与 `--to` 目录拼进命令，故 `optionId` 被忽略；MCP 必须给出已受支持的
 * `optionId`，否则抛出「请选择受支持的 MCP 安装项」。
 */
export function cliResourceCommand(
  asset: AssetResponse,
  origin: string,
  optionId?: string,
  client: InstallationClient = 'codex',
): string {
  const base = `--version ${shellArgument(asset.current_release.version_label)} --url ${shellArgument(new URL(origin).origin)}`;
  if (asset.kind === 'skill') {
    const command = `capability-hub add ${shellArgument(asset.slug)} ${base} --to ${agentClients[client].skillDirectory}`;
    return `# 预览\n${command} --dry-run\n\n# 安装\n${command}`;
  }
  const option = requireMcpOption(asset, optionId);
  return `capability-hub mcp-config ${shellArgument(asset.slug)} ${base} --client ${client} --option ${shellArgument(option.option_id)}${option.has_shared_key ? ' --scope user' : ''}`;
}

function requireMcpOption(asset: AssetResponse, optionId: string | undefined) {
  const option = installationMethods(asset).options.find((option) => option.option_id === optionId);
  if (asset.kind !== 'mcp' || !option) throw new Error('请选择受支持的 MCP 安装项');
  return option;
}

/**
 * 含共享密钥的安装项使用用户配置，并要求 Agent 隐去对话中的密钥。
 * `optionId` 不受支持时与 {@link cliResourceCommand} 一样抛错，不返回兜底文案。
 */
export function hubMcpConfigurationPrompt(
  asset: AssetResponse,
  optionId: string,
  client: InstallationClient,
): string {
  const option = requireMcpOption(asset, optionId);
  return `请使用已配置的 Capability Hub MCP，为「${asset.slug}」生成 ${client} 的${option.has_shared_key ? '用户' : '项目'}配置。\n调用 get_mcp_config，参数：\n${JSON.stringify(
    {
      version_id: asset.current_release.version_id,
      installation_option_id: optionId,
      client,
      scope: option.has_shared_key ? 'user' : 'project',
    },
    null,
    2,
  )}\n获取配置后，按所选客户端约定合并配置，保留已有条目。隐藏对话中的密钥，仅对 required_variables 列出的变量说明本地设置步骤，再重新加载客户端。请区分配置生成、配置写入和连接验证的实际结果。`;
}
