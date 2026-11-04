import { z } from 'zod';
import { agentClientIds, agentClients, hubConnectionCheck } from './agent-clients.js';

/** 官方 Skill 的目录名、frontmatter name 与目录发布名称一致。 */
export const hubClientSkillName = 'use-capability-hub';

/** 随产品交付的正文使用独立路径，目录资产仍由固定版本的受众策略控制。 */
export const hubClientSkillPath = `/connect/skills/${hubClientSkillName}/SKILL.md`;

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

/** 通用入口按任务和运行能力分流，内置模板只覆盖已有客户端适配。 */
export function hubInstallationGuide(origin: string, publishedSkillUrl?: string): string {
  const base = new URL(origin).origin;
  const cliUrl = `'${base.replaceAll("'", "'\"'\"'")}'`;
  const clients = agentClientIds.map(
    (client) =>
      `| ${agentClients[client].label} | ${client} | [当前项目](${base}/connect/mcp?client=${client}&scope=project) | [当前用户](${base}/connect/mcp?client=${client}&scope=user) |`,
  );
  return [
    '# 接入 Capability Hub',
    '',
    'Capability Hub 帮助 Agent 发现和使用 Skill 与 MCP。根据当前任务和实际运行能力选择 MCP 或独立 CLI，接入后继续用户原来的任务。',
    `Hub 地址：${base}；MCP 地址：${base}/mcp。`,
    '这是公开的首次接入说明，无需登录即可读取，也不需要先调用 Hub MCP 工具。此说明不授予账号或资源访问权限。',
    '',
    '## 1. 选择当前可用的方式',
    '先按第 4 步验证同一实例已有的 MCP 或 CLI，能完成任务就复用。根据会话明确提供的工具、终端和运行环境判断；不要凭模型名称或其他客户端的配置目录猜测。同名连接指向另一实例时，由用户选择是否替换。',
    '',
    '| 实际能力与任务 | 接入方式 |',
    '| --- | --- |',
    '| 支持 Streamable HTTP MCP 及相应授权，需要工具调用、正文读取或贡献 | 直接接入 MCP |',
    '| 能运行 Node.js 和终端命令，需要搜索或下载安装 Skill | 独立 CLI，无需选择客户端品牌 |',
    '| 支持 stdio、能运行 CLI，且属于下表预设客户端 | CLI 接入助手与 bridge；仍是 MCP 接入 |',
    '| 当前环境无法使用 MCP 或 CLI | 说明缺少的能力，仅提供已确认可行的人工步骤 |',
    '',
    '两种方式可按任务组合使用。仅在需要写入配置或安装 Skill 时确认实际客户端、位置与范围；无法确定时询问用户，已有选择直接沿用。',
    '',
    '## 2. MCP：接入 Hub 工具',
    '按客户端官方格式配置上述 Streamable HTTP 地址。原生 OAuth 可用时由客户端发起浏览器授权；默认申请 hub:read，需要分享、推荐或反馈且已获用户授权时再追加 hub:contribute。',
    `仅支持 HTTP 请求头时，可由用户在[账号安全页](${base}/account?tab=security)创建个人令牌，并按客户端支持的私有凭据方式设置 Authorization: Bearer <令牌>。不要索取、读取或回显秘密值，不猜测环境变量插值格式，不因网络或权限错误自动切换认证方式。`,
    `CLI 接入助手仅适用于下表客户端：按 [CLI 安装说明](${base}/connect/cli) 安装后，执行对应说明中的 connect，由 bridge 提供 stdio MCP。它需要浏览器可达的本机回调；--no-browser 只关闭自动打开浏览器。无需先执行独立 CLI 的 login。`,
    '',
    '### 内置配置模板',
    '下表提供快捷配置，其他支持 Streamable HTTP 的客户端按其官方格式接入。仅向配置接口或 --client 传入实际匹配的表中标识，不冒用其他客户端。合并 capability-hub 条目时保留已有设置。',
    '',
    '| 客户端 | 标识 | 项目配置说明 | 用户配置说明 |',
    '| --- | --- | --- | --- |',
    ...clients,
    '',
    `如需结构化配置，可读取 ${base}/api/hub-mcp-config?client=CLIENT&scope=SCOPE，将 CLIENT 替换为表中标识，SCOPE 替换为 project 或 user。`,
    '',
    '## 3. CLI：独立搜索和安装',
    `按 [CLI 安装说明](${base}/connect/cli) 准备运行环境、安装并验证命令。复用已有的当前实例登录；未登录时使用 login，在浏览器核对授权码并批准。此流程无需本机回调，也不写入 Agent 的 MCP 配置。`,
    '使用 search --json 搜索资源；安装 Skill 时明确版本和 --to 目录，先用 add --dry-run 预览。独立 CLI 不要求客户端标识；mcp-config 的配置生成仍限上表客户端。',
    'CLI 尚无正文读取或贡献命令，搜索摘要不能代替正文。需要这些能力时使用 MCP 或网页，不为仅读取擅自持久安装 Skill。',
    '',
    '## 4. 验证接入结果',
    `MCP：按目标客户端要求完成信任、重载或重启。${hubConnectionCheck} connect/status 的自检不能代替目标 Agent 的工具调用。`,
    'CLI：执行下面的当前实例查询，成功返回空列表也算验证通过：',
    '',
    '```sh',
    `capability-hub search --url ${cliUrl} --json --no-interactive`,
    '```',
    '',
    '分别报告安装或配置、授权和对应通路的验证结果。配置已生成不代表已连接；CLI 可访问不代表 Agent 已接入 MCP。不能完成的步骤说明缺少的能力，不生成未经验证的接入命令。',
    '',
    '## 无法访问或需要手动接入',
    `预设客户端的手动接入页：${base}/connect。没有账号或所需权限时，联系此 Hub 的管理员获取访问资格。`,
    '从 Agent 实际运行环境核对网络；远程或容器中的 localhost 指向该环境自身。只能由用户读取说明时，可请其转交完整指令；Hub 地址不可达时，请部署方提供可达地址。',
    '',
    '## 接入后的官方客户端 Skill',
    `按需阅读 [${hubClientSkillName} 使用指南](${base}${hubClientSkillPath})，区分当次读取、持久安装、接入目标 MCP 和提交分享。只用本次能力时无需安装。`,
    ...(publishedSkillUrl
      ? [
          `需要持久安装时，可从[本实例已审核的固定版本](${publishedSkillUrl})取得完整包，确认客户端目录后写入。`,
        ]
      : [
          `如需长期使用这份随附的单文件 Skill，确认目标目录后，将正文保存为该客户端技能目录下的 ${hubClientSkillName}/SKILL.md。已有同名目录时先核对来源和内容。`,
        ]),
    '',
  ].join('\n');
}
