import { publicResourcePath } from '@capability-hub/contracts';
import type { AssetView } from './asset-view.js';

/**
 * 仅对匿名可读的版本给出对话安装文案；受限版本直接抛错，提示改走授权下载或 CLI。
 * 链接基于当前 `origin` 拼接并锁定展示的版本，文案里不出现真实凭证。
 */
export function installationPrompt(view: AssetView, origin: string): string {
  const { asset, release } = view;
  if (!view.publicReadable) throw new Error('受限资源请使用授权下载、CLI 或受支持的 Hub MCP 操作');
  const path = publicResourcePath(asset.kind, asset.slug, release.version_label);
  const url = new URL(path, origin).href;
  if (asset.kind === 'mcp') return `请安装这个 MCP：\n${url}`;
  return [
    `请帮我安装 Skill「${asset.slug}」${release.version_label}：`,
    url,
    '',
    '请按链接中的说明，将完整资源包安装到当前 Agent 支持的技能目录；已有同名 Skill 时先确认如何处理。完成后告知安装位置和使用方式，遇到问题请说明原因。',
  ].join('\n');
}
