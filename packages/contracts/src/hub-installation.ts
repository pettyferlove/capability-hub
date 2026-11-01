import { z } from 'zod';
import { agentClientIds, agentClients } from './agent-clients.js';

/** 分享 Hub 接入邀请时返回的结构化结果，出现在分享/接入入口的响应里。 */
export const hubShareResponseSchema = z.object({
  installation_url: z.url(),
  prompt: z.string().min(1),
});

/** {@link hubShareResponseSchema} 的输出侧类型。 */
export type HubShareResponse = z.infer<typeof hubShareResponseSchema>;

/**
 * 生成接入邀请：只取 `origin` 的 origin 部分拼出 `/INSTALL.md` 地址，路径与查询串被忽略。
 * `origin` 非法时 `new URL` 会抛出 `TypeError`，调用方需先保证是绝对地址。
 */
export function hubShareInvitation(origin: string): HubShareResponse {
  const installation_url = `${new URL(origin).origin}/INSTALL.md`;
  return {
    installation_url,
    prompt: `请帮我将这个 Capability Hub 接入当前使用的 Agent：\n${installation_url}`,
  };
}

/** 通用入口只负责分流，具体配置继续由现有客户端适配生成。 */
export function hubInstallationGuide(origin: string): string {
  const base = new URL(origin).origin;
  const clients = agentClientIds.map(
    (client) =>
      `| ${agentClients[client].label} | ${client} | [当前项目](${base}/connect/mcp?client=${client}&scope=project) | [当前用户](${base}/connect/mcp?client=${client}&scope=user) |`,
  );
  return [
    '# 接入 Capability Hub',
    '',
    'Capability Hub 帮助 Agent 发现和使用 Skill 与 MCP。请按照下面的步骤将此 Hub 接入用户当前使用的 Agent。',
    `Hub 地址：${base}；MCP 地址：${base}/mcp。`,
    '这是公开的首次接入说明，无需登录即可读取，也不需要先调用 Hub MCP 工具。此说明不授予账号或资源访问权限。',
    '',
    '## 1. 确认客户端与范围',
    '优先根据当前会话明确提供的运行上下文识别客户端；无法确定时询问用户。不要仅凭模型名称、机器上存在某个配置目录或其他客户端的安装记录猜测。',
    '确认用户希望接入当前项目还是当前用户；已有明确选择时沿用，不重复询问。不要未经选择修改多个客户端或多个范围。',
    '如果当前客户端不在下表中，说明暂未提供对应适配，并引导用户查看手动接入页；不要套用其他客户端的格式。',
    '',
    '## 2. 读取对应接入说明',
    '确定客户端和范围后，读取下表中对应的公开 Markdown 链接。配置位置、配置内容、授权方式及客户端注意事项以该说明为准。',
    '',
    '| 客户端 | 标识 | 项目配置说明 | 用户配置说明 |',
    '| --- | --- | --- | --- |',
    ...clients,
    '',
    `如需结构化配置，可读取 ${base}/api/hub-mcp-config?client=CLIENT&scope=SCOPE，将 CLIENT 替换为表中标识，SCOPE 替换为 project 或 user。`,
    '检查已有配置并合并 capability-hub 条目，保留其他设置。同名条目指向其他实例时先告知用户差异并确认替换，不直接覆盖。',
    '',
    '## 3. 引导用户完成授权',
    `请用户在 ${base}/connect 查看接入引导，由客户端发起 OAuth 浏览器授权；没有账号或所需权限时，联系此 Hub 的管理员获取访问资格。默认只授权搜索和使用，需要贡献时再追加授权。`,
    '原生 OAuth 优先；不支持时使用部署方提供的接入助手，由助手保存凭据并配置本地桥接。不要索取、搜索、读取或回显秘密值，不把真实令牌写入对话、分享链接或项目仓库。',
    '授权未完成时可以准备配置，但必须明确说明尚未连接。手动令牌仅作为高级入口。',
    '',
    '## 4. 验证接入结果',
    '按客户端要求完成项目信任、重新加载或重启，检查 Hub 工具列表并执行一次用户有权限的资源检索。分别报告配置写入、授权和实际连接验证结果；配置已生成不代表已连接。',
    '如果当前 Agent 不能写入客户端配置或无法完成连接验证，提供准确的手动步骤，不声称安装成功。连接成功后继续用户原来的检索或安装任务。',
    '',
    '## 无法访问或需要手动接入',
    `手动接入页：${base}/connect。用户可在此选择客户端并复制完整接入指令。`,
    '目标 Agent 必须能访问此 Hub 地址；内网地址可能需要对应网络，远程 Agent 中的 localhost 指向远程主机。无法读取说明时，请用户从接入页复制完整指令，不猜测配置。',
    '',
  ].join('\n');
}
