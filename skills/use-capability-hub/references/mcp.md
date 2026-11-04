# 通过 MCP 使用 Skill 和服务

以下使用 Hub MCP 工具名，以客户端实际发现的名称为准。成功调用 `search_skills` 即可验证连接，空结果也算成功。

## 查找并使用团队规范

1. 用任务关键词调用 `search_skills`，按 `description`、`applies_to` 选候选。空结果只说明当前查询没有可见匹配，可改用资源名或更短的关键词。翻页把 `next_cursor` 传回同一查询的 `cursor`；遇到 `CURSOR_EXPIRED` 从第一页重查。
2. 用户只要推荐且摘要足够时，返回候选、版本和理由。需要正文时，以结果的 `current_release.version_id` 调用 `load_skill`，读取 `body` 和 `compatibility`。附属资料从 `manifest.files` 选路径，用同一 `version_id` 调用 `read_skill_file`。`truncated: true` 时用返回的 `next_offset` 续读；`binary: true` 时按需使用 `download_url`。
3. 应用规则完成原任务，注明资源和版本；持久安装按[本地写入](../SKILL.md#本地写入)处理。

## 安装 Skill

1. 用固定的 `version_id` 调用 `install_skill`；预设客户端可传 `client`，未知客户端省略。保留首块的 `manifest`，逐块解码 `archive_chunk.data` 的 Base64，按 `archive_chunk.offset` 拼接 ZIP 归档。把 `archive_chunk.next_offset` 作为下一次的 `offset`，直到 `archive_chunk.complete` 为真。
2. 核对完整归档的 `sha256:<十六进制摘要>` 与 `artifact_digest`，核对归档与 `manifest.files` 的文件集合一致，逐项校验相对路径、大小、SHA-256 和执行属性。缺块、清单不符或路径越出目标目录时停止，保留已有安装。
3. 校验通过后按[本地写入](../SKILL.md#本地写入)安装完整目录。

## 配置或接入目录里的 MCP

以下配置工具仅支持预设客户端；未知客户端按目标服务和客户端的官方说明接入，不冒用其他 `client`。用 `search_mcp` 找到目标，从 `installation_options` 选择 `supported` 为真的项，将 `current_release.version_id`、`option_id` 分别作为 `version_id`、`installation_option_id`，传入实际 `client` 和所选 `scope`。`has_shared_key` 为真时只把配置写入客户端私有位置，对话中隐藏密钥；用户指定仓库共享位置时先请其选择私有位置。

- “给我看配置”用 `get_mcp_config`，说明配置位置和 `required_variables`。
- “把这个服务接进来”用 `activate_mcp`。`awaiting_client_confirmation` 表示方案已生成。按已确认的目标与位置合并配置，保留其他条目，依说明在本地设置变量。重载并列出**目标服务**的工具后再报告已连接，否则说明已完成步骤。
