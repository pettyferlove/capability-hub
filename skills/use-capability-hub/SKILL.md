---
name: use-capability-hub
description: 接入 Capability Hub，查找并使用团队共享的 Skill 和 MCP。适用于任务需要 Hub 中的团队规范或服务、用户给出 Hub 邀请或资源链接、要邀请同事接入 Hub，或要向 Hub 提交本地 Skill、推荐资源或上报版本反馈的场景。
---

# 使用 Capability Hub

## 选对入口

- **接入 Hub 本身**。目录检索和贡献需要 Hub MCP。优先复用指向目标实例的连接，尚未接入时读取该实例的 `/INSTALL.md`。用一次 `search_skills` 验证，成功返回空列表也说明查询已执行。接入后继续用户原来的任务。下文使用 Hub 的工具名，调用时以客户端实际发现的名称为准。
- **收到固定版本链接**。`/skills/<slug>/<version>` 和 `/mcp-servers/<slug>/<version>` 指向单项资源。直接读该版本的公开说明，沿用链接指定的版本。安装公开 Skill 时从说明下载完整包，按下文的本地写入步骤安装。
- **“把这个 Hub 分享给同事”**。读取该实例公开的 `GET /api/hub-share`，只把返回的 `prompt` 原样交给用户。此操作无需连接 MCP 或申请贡献权限。

## 查找并使用团队规范

“推荐一份接口评审规范”要的是候选和选择理由。“按团队规范评审这次变更”还要读取规范并完成评审。项目约定从 Hub 取业务规则时，即使用户只说“调整退款风控”，也可以用“退款 风控”检索适用规范。

1. 用任务关键词调用 `search_skills`。按 `description`、`applies_to` 选择候选。空结果只说明当前查询没有可见匹配，必要时改用资源名或更短的关键词。翻页把 `next_cursor` 传回同一查询的 `cursor`。遇到 `CURSOR_EXPIRED` 从第一页重新查。
2. 用户只要推荐，且目录信息足以说明理由时，返回候选、版本和理由即可。需要核实具体做法或按规范执行时，用选中结果的 `current_release.version_id` 调用 `load_skill`，读取 `body` 和 `compatibility`。正文引用附属资料时，从 `manifest.files` 选路径，用同一 `version_id` 调用 `read_skill_file`。文本返回 `truncated: true` 就用返回的 `next_offset` 续读。返回 `binary: true` 时按需使用 `download_url`。
3. 把适用的规则用于原任务，交付实际结果并注明使用的资源和版本。只有用户要求长期安装时才写入客户端技能目录。

## 安装 Skill 到客户端

1. 从 Hub MCP 安装时，用固定的 `version_id` 和当前 `client` 调用 `install_skill`。保留首块的 `manifest`。逐块解码 `archive_chunk.data` 的 Base64，按 `archive_chunk.offset` 拼接原始字节。把 `archive_chunk.next_offset` 作为下一次的 `offset`，直到 `archive_chunk.complete` 为真。
2. 核对完整归档的 `sha256:<十六进制摘要>` 与 `artifact_digest`，逐项核对 `manifest.files` 的相对路径、大小和 SHA-256。缺块、清单不符或路径越出目标目录时停止，保留已有安装。
3. **本地写入**。按用户选择的范围确定实际目录。`suggested_directory` 是 Hub 给当前客户端的建议。向用户说明目录、文件和其中的脚本，按已确认的选择写入完整目录。同名内容有差异时先确定如何处理，替换前备份。核对实际落盘文件后报告安装位置，执行附带脚本需另获授权。

## 配置或接入目录里的 MCP

用 `search_mcp` 找到目标，从 `installation_options` 选择 `supported` 为真的项。用 `current_release.version_id` 作为 `version_id`，用该项的 `option_id` 作为 `installation_option_id`，并传入实际 `client` 和用户选择的 `scope`。若该项标有 `has_shared_key`，只把配置交付到客户端私有位置，对话中隐藏密钥。用户指定了仓库共享配置时，先请其选择私有位置。

- “给我看配置”用 `get_mcp_config`，说明配置位置和 `required_variables`。
- “把这个服务接进来”直接用 `activate_mcp`。`awaiting_client_confirmation` 表示接入方案已生成。确认目标和配置位置后合并条目，保留已有配置，按返回说明在本地设置所需变量。重载客户端并列出**目标服务**的工具后再报告已连接。无法重载时说明已经完成哪一步。

## 向 Hub 贡献

提交 Skill、登记推荐和上报反馈都需要贡献权限。如果当前连接缺少所需工具，引导用户到该实例的 `/connect?permission=contribute` 追加授权并刷新工具。能看见工具仍需具备对应的账号权限。

### 把本地 Skill 分享给团队

1. 确定 `version_label` 和文件清单，只提交用户选定目录里的文件，包含根目录 `SKILL.md`，排除凭据和私人记录。超过 100 个文件或解码后总量超过 512 KiB 时改走网页 ZIP 上传。
2. 用 `share_skill` 新建时，`destination` 取 `target: new`、`slug` 和 `owner_group_id`。归属不明确就到发布页选择。更新已有上传资产则取 `target: existing` 和 `asset_id`。Git 来源的资产从登记来源同步。
3. 返回 `submitted_for_scanning` 时报告“已提交扫描”，给出 `publication_url` 供用户选择受众并提交独立审核。

### 推荐资源或上报版本反馈

- **“给刚用的资源点推荐”**。用目录结果的 `asset_id` 调用 `rate_asset`，推荐时传 `recommended: true`，取消时传 `false`。
- **“把这个问题反馈给维护者”**。有本次或预先授予的上报授权时，才对固定版本调用 `report_asset_feedback` 并传 `consent: true`。按缺陷、能力缺口或改进建议选择 `kind`，写明标题、使用场景、预期和实际结果，区分观察与推断。只提交脱敏的最小复现，成功后交付返回的 `detail_url`。

同一次提交或反馈重试时，保持请求内容和 `idempotency_key` 一致，提交 Skill 使用 UUID。工具返回 `isError: true` 时，读取错误码和原因，说明受影响的步骤，按 `retryable` 判断是否原样重试。
