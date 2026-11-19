import { publicResourcePath, shellArgument } from '@capability-hub/contracts';
import { sharedKeysForOption } from '@capability-hub/application';
import type { HubServices } from '../bootstrap/hub-services.js';

/** 以普通 HTTP 文档交付固定版本安装说明。 */
export async function createInstallationGuide(
  hub: HubServices,
  kind: 'skill' | 'mcp',
  slug: string,
  label: string,
): Promise<string> {
  const { asset, version, notice } = await hub.store.tx(async () => {
    const version = await hub.assetAccess.requirePublicVersion(kind, slug, label);
    const asset = await hub.assetAccess.getAsset(version.asset_id);
    return { asset, version, notice: await hub.assetAccess.versionNotice(null, asset, version.id) };
  });
  const base = new URL(
    publicResourcePath(asset.kind, asset.slug, version.version_label),
    hub.config.publicUrl,
  ).href;
  const lines = [
    `# ${asset.slug}`,
    '',
    `${asset.kind === 'skill' ? 'Skill' : 'MCP'} · ${version.version_label}`,
    '',
  ];
  if (!notice.is_latest && notice.latest_release) {
    const latest = notice.latest_release.version_label;
    const url = new URL(publicResourcePath(asset.kind, asset.slug, latest), hub.config.publicUrl);
    lines.push(`最新版本为 [${latest}](${url.href})。`, '');
  }
  if (notice.lifecycle === 'deprecated') {
    const replacement = notice.replacement_asset_slug;
    lines.push(
      replacement
        ? `此资源已弃用。替代资源：[${replacement}](${new URL(`/asset/${replacement}`, hub.config.publicUrl).href})。`
        : '此资源已弃用。',
      '',
    );
  }
  lines.push(asset.kind === 'skill' ? '## 安装' : '## 配置', '');
  if (asset.kind === 'skill') {
    lines.push(
      `公开 Skill 无需登录。先按 [CLI 安装说明](${new URL('/connect/cli', hub.config.publicUrl).href}) 准备命令，再将 \`<技能父目录>\` 换成实际目录：`,
      '',
      '```sh',
      `capability-hub add ${shellArgument(asset.slug)} --version ${shellArgument(version.version_label)} --url ${shellArgument(new URL(hub.config.publicUrl).origin)} --to ${shellArgument('<技能父目录>')} --dry-run`,
      '```',
      '',
      '核对安装位置和差异后，去掉 `--dry-run` 安装。',
      '',
      `无法运行 CLI 时，[下载资源包](${base}/download)，核对归档摘要 \`${version.artifact_digest}\`。`,
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
