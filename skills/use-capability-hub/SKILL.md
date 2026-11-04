---
name: use-capability-hub
description: 接入 Capability Hub，查找并使用团队共享的 Skill 和 MCP。适用于任务需要 Hub 中的团队规范或服务、用户给出 Hub 邀请或资源链接、要邀请同事接入 Hub，或要向 Hub 提交本地 Skill、推荐资源或上报版本反馈的场景。
---

# 使用 Capability Hub

## 选对入口

- **接入 Hub 本身**。读取该实例的 `/INSTALL.md`，按当前环境和任务选择 MCP 或独立 CLI，优先复用同实例已验证的连接或登录。CLI 查询可用不代表 MCP 已接入。接入后继续原任务。
- **收到固定版本链接**。`/skills/<slug>/<version>` 和 `/mcp-servers/<slug>/<version>` 指向单项资源；读取公开说明并沿用版本。安装公开 Skill 时下载完整包，按下文“本地写入”处理。
- **“把这个 Hub 分享给同事”**。读取实例公开的 `GET /api/hub-share`，将返回的 `prompt` 原样交给用户；无需 MCP 或贡献权限。

## 按任务读取操作说明

- 通过终端搜索或安装 Skill：读取 [CLI 搜索和安装](references/cli.md)。
- 通过 MCP 查找、读取或安装 Skill，或配置目录中的 MCP 服务：读取 [MCP 使用](references/mcp.md)。
- 提交本地 Skill、推荐资源或上报反馈：读取 [向 Hub 贡献](references/contribution.md)。

只读取当前任务需要的资料。在线读取时，相对链接以当前文档 URL 为基准；通过 Hub MCP 加载时，从同一 `version_id` 的 `manifest.files` 选路径并调用 `read_skill_file`，不要混用不同版本的正文和附属文件。

## 本地写入

只有用户要求长期安装时才写入客户端技能目录。默认写入已确认父目录下的 `<slug>/`（`slug` 来自响应）；用户明确指定最终目录时沿用。`suggested_directory` 仅供参考，省略 `client` 时的默认值不代表客户端实际目录。

说明目标目录、文件和脚本后写入完整目录，保留 `SKILL.md` 及全部附属文件。同名内容有差异时先确定处理方式，替换前备份。核对落盘文件后报告位置，执行附带脚本需另获授权。

工具返回 `isError: true` 时，读取错误码和原因，说明受影响的步骤，按 `retryable` 判断是否原样重试。
