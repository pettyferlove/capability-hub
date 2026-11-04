---
name: use-capability-hub
description: 接入 Capability Hub，查找并使用团队共享的 Skill 和 MCP。适用于任务需要 Hub 中的团队规范或服务、用户给出 Hub 邀请或资源链接、要邀请同事接入 Hub，或要向 Hub 提交本地 Skill、推荐资源或上报版本反馈的场景。
---

# 使用 Capability Hub

## 选对入口

- **接入 Hub 本身**。读取该实例的 `/INSTALL.md`，按当前环境和任务选择 MCP 或独立 CLI，优先复用同实例已验证的连接或登录。CLI 查询可用不代表 MCP 已接入。接入后继续原任务。
- **收到固定版本链接**。`/skills/<slug>/<version>` 和 `/mcp-servers/<slug>/<version>` 指向单项资源；读取公开说明并沿用版本。安装公开 Skill 时下载完整包，按下文“本地写入”处理。
- **“把这个 Hub 分享给同事”**。读取实例公开的 `GET /api/hub-share`，将返回的 `prompt` 原样交给用户；无需 MCP 或贡献权限。

## 通过 CLI 搜索和安装

先读实例的 `/connect/cli`，在 Agent 实际执行命令的环境准备 CLI。`HUB_URL` 使用当前实例地址，资源名、版本和目录使用已确认值。

- 用 `capability-hub search "关键词" --url "HUB_URL" --json --no-interactive` 搜索并验证；成功返回空列表也算可用。已有有效登录时直接使用，仅缺少或失效授权时运行 `capability-hub login --url "HUB_URL" --no-interactive`，由用户在浏览器核对授权码并批准，不读取或回显凭据。
- 明确要求安装时，用 `capability-hub add NAME --version VERSION --to "PATH" --url "HUB_URL" --dry-run --no-interactive` 预览；`--to` 指定父目录，实际写入其下的 `<slug>/`。核对目录与差异后去掉 `--dry-run` 安装，已有内容按下文“本地写入”处理。
- CLI 没有正文读取或贡献命令，搜索摘要不能当作正文。需要正文时通过 MCP 或固定版本的公开说明读取；无法取得时说明缺口，不为仅读取擅自持久安装。

## 通过 MCP 查找并使用团队规范

以下使用 Hub MCP 工具名，以客户端实际发现的名称为准。成功调用 `search_skills` 即可验证连接，空结果也算成功。

1. 用任务关键词调用 `search_skills`，按 `description`、`applies_to` 选候选。空结果只说明当前查询没有可见匹配，可改用资源名或更短的关键词。翻页把 `next_cursor` 传回同一查询的 `cursor`；遇到 `CURSOR_EXPIRED` 从第一页重查。
2. 用户只要推荐且摘要足够时，返回候选、版本和理由。需要正文时，以结果的 `current_release.version_id` 调用 `load_skill`，读取 `body` 和 `compatibility`。附属资料从 `manifest.files` 选路径，用同一 `version_id` 调用 `read_skill_file`。`truncated: true` 时用返回的 `next_offset` 续读；`binary: true` 时按需使用 `download_url`。
3. 应用规则完成原任务，注明资源和版本；只有用户要求长期安装时才写入客户端技能目录。

## 通过 MCP 安装 Skill

1. 用固定的 `version_id` 调用 `install_skill`；预设客户端可传 `client`，未知客户端省略。保留首块的 `manifest`，逐块解码 `archive_chunk.data` 的 Base64，按 `archive_chunk.offset` 拼接 ZIP 归档。把 `archive_chunk.next_offset` 作为下一次的 `offset`，直到 `archive_chunk.complete` 为真。
2. 核对完整归档的 `sha256:<十六进制摘要>` 与 `artifact_digest`，逐项核对 `manifest.files` 的相对路径、大小和 SHA-256。缺块、清单不符或路径越出目标目录时停止，保留已有安装。
3. **本地写入**。默认写入已确认父目录下的 `<slug>/`（`slug` 来自响应）；用户明确指定最终目录时沿用。`suggested_directory` 仅供参考，省略 `client` 时的默认值不代表客户端实际目录。说明目标目录、文件和脚本后写入完整目录。同名内容有差异时先确定处理方式，替换前备份。核对落盘文件后报告位置，执行附带脚本需另获授权。

## 配置或接入目录里的 MCP

以下配置工具仅支持预设客户端；未知客户端按目标服务和客户端的官方说明接入，不冒用其他 `client`。用 `search_mcp` 找到目标，从 `installation_options` 选择 `supported` 为真的项，将 `current_release.version_id`、`option_id` 分别作为 `version_id`、`installation_option_id`，传入实际 `client` 和所选 `scope`。`has_shared_key` 为真时只把配置写入客户端私有位置，对话中隐藏密钥；用户指定仓库共享位置时先请其选择私有位置。

- “给我看配置”用 `get_mcp_config`，说明配置位置和 `required_variables`。
- “把这个服务接进来”用 `activate_mcp`。`awaiting_client_confirmation` 表示方案已生成。按已确认的目标与位置合并配置，保留其他条目，依说明在本地设置变量。重载并列出**目标服务**的工具后再报告已连接，否则说明已完成步骤。

## 通过 MCP 向 Hub 贡献

分享、推荐和反馈需要 `hub:contribute`，仍受账号权限限制。缺少工具时，OAuth 客户端追加此范围，由用户批准；预设客户端可从 `/connect?client=CLIENT&permission=contribute` 获取指令。使用 Bearer 时，由用户在 `/account?tab=security` 创建贡献范围令牌并更新客户端私有凭据，Agent 不读取真实值。重新连接并刷新工具；无法获得权限时改用 Hub 网页，CLI 登录不能替代贡献授权。

### 把本地 Skill 分享给团队

1. 确定 `version_label` 和清单，只提交用户选定目录的文件，包含根目录 `SKILL.md`，排除凭据和私人记录。超过 100 个文件或解码后总量超过 512 KiB 时改走网页 ZIP 上传。
2. 用 `share_skill` 新建时，`destination` 取 `target: new`、`slug` 和 `owner_group_id`。归属不明确就到发布页选择。更新已有上传资产则取 `target: existing` 和 `asset_id`。Git 来源的资产从登记来源同步。
3. 返回 `submitted_for_scanning` 时报告“已提交扫描”，给出 `publication_url` 供用户选择受众并提交独立审核。

### 推荐资源或上报版本反馈

- **“给刚用的资源点推荐”**。用目录结果的 `asset_id` 调用 `rate_asset`，推荐时传 `recommended: true`，取消时传 `false`。
- **“把这个问题反馈给维护者”**。有本次或预先授予的上报授权时，才对固定版本调用 `report_asset_feedback` 并传 `consent: true`。按缺陷、能力缺口或改进建议选择 `kind`，写明标题、使用场景、预期和实际结果，区分观察与推断。只提交脱敏的最小复现，成功后交付返回的 `detail_url`。

同一次提交或反馈重试时，保持请求内容和 `idempotency_key` 一致，提交 Skill 使用 UUID。工具返回 `isError: true` 时，读取错误码和原因，说明受影响的步骤，按 `retryable` 判断是否原样重试。
