import { agentClients, type AgentClient } from '@capability-hub/contracts';
import type { AssetResponse } from '@capability-hub/contracts/http';

export type InstallationClient = AgentClient;

/** 只展示当前 CLI 和 Hub MCP 已实现的操作。 */
export function installationMethods(asset: AssetResponse) {
  const publicResource = asset.current_release.distribution.audience.includes('public');
  const options = asset.installation_options.filter((option) => option.supported);
  return {
    publicResource,
    conversation: publicResource,
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

export function cliLoginCommand(origin: string): string {
  return `capability-hub login --url ${shellArgument(new URL(origin).origin)}`;
}

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
  requireMcpOption(asset, optionId);
  return `capability-hub mcp-config ${shellArgument(asset.slug)} ${base} --client ${client} --option ${shellArgument(optionId!)}`;
}

function requireMcpOption(asset: AssetResponse, optionId: string | undefined) {
  if (
    asset.kind !== 'mcp' ||
    !installationMethods(asset).options.some((option) => option.option_id === optionId)
  )
    throw new Error('请选择受支持的 MCP 安装项');
}

export function hubMcpConfigurationPrompt(
  asset: AssetResponse,
  optionId: string,
  client: InstallationClient,
): string {
  requireMcpOption(asset, optionId);
  return `请使用已配置的 Capability Hub MCP，为「${asset.slug}」生成 ${client} 的项目配置。\n调用 get_mcp_config，参数：\n${JSON.stringify(
    {
      version_id: asset.current_release.version_id,
      installation_option_id: optionId,
      client,
      scope: 'project',
    },
    null,
    2,
  )}\n获取配置后，按所选客户端约定合并配置，保留已有条目，并说明变量设置和重新加载步骤。真实密钥由我在本地配置，不发送给 Hub。请区分配置生成、配置写入和连接验证的实际结果。`;
}
