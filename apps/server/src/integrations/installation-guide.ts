import { publicResourcePath } from '@capability-hub/contracts';
import { sharedKeysForOption } from '@capability-hub/application';
import type { HubServices } from '../bootstrap/hub-services.js';

/** 以普通 HTTP 文档交付固定版本安装说明。 */
export async function createInstallationGuide(hub: HubServices, id: string): Promise<string> {
  const version = await hub.assetAccess.requireReadableVersion(null, id);
  const asset = await hub.assetAccess.getAsset(version.asset_id);
  const base = new URL(
    publicResourcePath(asset.kind, asset.slug, version.version_label),
    hub.config.publicUrl,
  ).href;
  const lines = [
    `# ${asset.slug}`,
    '',
    `${asset.kind === 'skill' ? 'Skill' : 'MCP'} · ${version.version_label}`,
    '',
    asset.kind === 'skill' ? '## 安装' : '## 配置',
    '',
  ];
  if (asset.kind === 'skill') {
    lines.push(
      `[下载资源包](${base}/download)`,
      '',
      `解压后将 ${asset.slug} 安装到当前 Agent 的技能目录，保留包内目录结构。`,
      `使用说明：[SKILL.md](${base}/files/SKILL.md)。`,
      '已有同名技能时，先确认如何处理。安装后说明实际保存位置。',
    );
  } else {
    const shared = (version.metadata.installation_options ?? []).filter(
      (option) => sharedKeysForOption(asset, option).length,
    );
    lines.push(
      `[服务描述 server.json](${base}/files/server.json) · [下载资源包](${base}/download)`,
      '',
      ...(shared.length
        ? [
            '共享密钥由已登录且有版本读取权限的使用者获取。请通过 Hub MCP 的 get_mcp_config 或已授权的 CLI 生成用户配置。',
            ...shared.map(
              (option) =>
                `CLI：\`capability-hub mcp-config ${asset.slug} --version ${version.version_label} --client CLIENT --option ${option.option_id} --scope user --url ${hub.config.publicUrl}\`（CLIENT 替换为客户端标识）。`,
            ),
          ]
        : [
            '根据以下服务描述，选择当前客户端支持的安装项并完成配置。保留已有 MCP 条目，需要的变量和密钥在本地设置。',
          ]),
      '',
      '```json',
      JSON.stringify(version.metadata.server_json, null, 2),
      '```',
    );
  }
  lines.push('');
  return lines.join('\n');
}
