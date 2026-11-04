# HTTP、MCP 与 CLI

## HTTP

HTTP 契约在 packages/contracts/src；http/ 目录按业务划分 Response，请求 Schema 由同包公开导出。请求体/查询在入口校验，错误返回 code、message、details、retryable 和 request_id；意外内部错误不暴露原文。响应已经开始时终止连接，错误仍只进入脱敏日志。

| 入口组                                                   | 用途                                   |
| -------------------------------------------------------- | -------------------------------------- |
| /api/auth/status、/auth/setup、/auth/login、/auth/logout | 初始化和浏览器认证                     |
| /auth/cli/request、/auth/cli/poll、/api/cli/approve      | 浏览器批准 CLI                         |
| /api/assets、/api/scenarios                              | 按当前受众发现与读取                   |
| /api/ratings、/api/nominations                           | 按 asset_id 推荐、按 release_id 提名   |
| /api/versions/:id/manifest、archive、files               | 已发布固定内容                         |
| /skills/:slug/:version、/mcp-servers/:slug/:version      | 人可读公开资源地址，按匿名权限         |
| /api/feedback、/api/assets/:id/feedback                  | 私有反馈提交、详情、处理与分页         |
| /api/management/*                                        | 维护和候选审查                         |
| /api/intakes、/api/sources、/api/publication-requests    | 接收、来源与审核                       |
| /api/me/*、/api/tokens、/api/git-credentials             | 个人资料、会话、令牌与仓库凭据         |
| /api/admin/*                                             | 账号、角色、审计及运行管理             |
| /api/hub-mcp-config、/connect/mcp                        | 首次接入配置与 Markdown 说明，无秘密值 |
| /api/hub-share、/INSTALL.md                              | 公开分享邀请与不预选客户端的接入引导   |
| /connect/skills/use-capability-hub/SKILL.md              | 随产品交付的官方客户端使用指南         |
| /mcp                                                     | Hub MCP；需要有效身份                  |

需要修订的修改携带 If-Match，幂等用例携带 Idempotency-Key。Cookie 写入还需 CSRF。

`POST /api/publication-requests` 的 `scenario_ids` 引用已登记场景，`proposed_scenarios` 可选，每项含 `name` 和 `description`。含新定义的申请需要平台审核。管理员从 `GET /api/admin/scenarios` 读取词条和修订，以 `PATCH /api/admin/scenarios/:id` 编辑（`edit`）、合并（`merge` 和 `target_id`）或停用（`disable`）。合并使已有发布可按目标场景检索，历史快照与角色绑定保留原 ID。

`POST /auth/login` 接受 `username`、`password` 和 `provider`。来源为 `local` 或 `ldap`，省略时仅验证本地密码。实例未启用 LDAP 时，选择 `ldap` 返回 403 `LDAP_DISABLED`。当前账号和管理台用户记录均以 `auth_provider` 标明来源。

从头像菜单进入运营中心（`/operations`）可查看资源趋势。`GET /api/admin/resource-activity?days=7` 支持近 7 或 30 个北京时间自然日，分别按正式发布时间、分发审计时间和反馈提交时间计数。使用包含归档下载、Skill 加载和安装准备请求；当期反馈按当前处理状态分组。

运营总览、Agent 运行分析、Token 用量、实例运行和操作审计需要平台级 `audit:read`。实例运行与 Agent 运行分析复用 `GET /api/admin/operations` 快照，执行趋势按创建日统计，成功率为完成数除以完成、失败和超时之和。HTTP P95 为本进程耗时桶界限。

「Token 用量」使用 `GET /api/admin/token-usage` 按模型请求开始时间汇总留存调用。`period` 支持 `today`、`7d`、`30d` 和默认的 `all`；全部留存按月，其余按日。Agent、模型档案和用户占比均以已确认 Token 为分母，部分回传和待结算请求单列。

`PATCH /api/assets/:id/usage` 更新 Skill 的资产级使用要求，请求体为 `{ "requires_api_key": true }` 或 `false`，需要当前资产维护权限及 `If-Match`。新建资产默认 `false`；目录列表、详情和资产维护列表返回 `requires_api_key`。非 Skill 返回 422，修订冲突返回 412；变更记录审计，不保存实际 API Key。实际变更会递增资产修订，并按现有审核上下文规则使待审申请失效；当前已发布内容保持可用。

Skill 的上传与提交审核请求均可携带布尔字段 `requires_api_key`；MCP 不接受此字段。接收详情返回 `proposed_requires_api_key`，提交时可明确修正，省略时沿用本次接收声明或资产当前声明。审核申请将其纳入 `canonical_policy_json` 与 `policy_digest`，审核响应和发布记录保留提交时的值；通过后将该声明用于资产标签。已有资产上传新版本不会提前修改当前目录标签。

## Hub MCP

服务器通过官方 SDK 在同一 `/mcp` 入口支持现代 `2026-07-28` 协议及使用 `initialize` 握手的 `2025-03-26`、`2025-06-18`、`2025-11-25` Streamable HTTP 客户端。握手协议采用无会话模式，各版本共用工具定义、令牌作用域与逐请求身份校验。MCP 标准协议兼容不属于项目旧数据或旧业务接口的兼容；不通过伪造版本 Header 转换协议，也不提供旧式 HTTP+SSE 独立端点。

集成测试覆盖现代协议发现，以及上述三个握手版本的初始化、工具列表、工具调用、贡献权限隔离和令牌撤销；具体 Agent 产品仍须另行完成真实连接验收。

| 工具                          | 交付结果                                             |
| ----------------------------- | ---------------------------------------------------- |
| search_skills / search_mcp    | 可见固定版本资源及分页                               |
| load_skill / read_skill_file  | 根正文或指定参考文件                                 |
| install_skill                 | 固定归档的分段字节、摘要及安装材料；客户端确认后写入 |
| get_mcp_config / activate_mcp | 客户端配置、变量及连接步骤；Hub 不实际连接目标       |
| share_skill                   | 接收 Skill 并进入静态扫描和网页审核流程              |
| report_asset_feedback         | 上报固定版本的问题或建议，返回编号、状态与详情链接   |
| rate_asset                    | 按 asset_id 推荐或取消推荐资源                       |

hub:read 不注册贡献工具。hub:contribute 的分享操作需要创建或维护权限，推荐要求当前发布可读，反馈要求指定版本可读。工具调用重新解析当前身份。客户端配置与变量格式见 [Agent 客户端接入](agent-clients.md)。runtime_client_verification 为 false。install_skill 可通过 client 选择建议技能目录。

远程 MCP 服务地址禁止内嵌账号密码，公网建议使用 HTTPS。API Key 和团队 Bearer Token 可由使用者自备或由 Hub 共享。录入、替换共享凭据须再次确认。已登录且可读该版本的用户可从安装配置中复制原值，公开版本对所有登录用户开放。共享值单独提交、加密保存，写入须传 `confirm_sharing: true`。维护接口 `GET/PUT /api/management/assets/:id/mcp-keys` 按地址、头名及认证方式区分绑定，Bearer 使用 `scheme: "bearer"`。写操作需要 If-Match 和 Idempotency-Key。

## 资源反馈

`report_asset_feedback` 支持 Skill/MCP，`kind` 为 defect（缺陷）、capability_gap（能力缺口）或 suggestion（建议）。必填 `version_id`、`idempotency_key`、`kind`、`title`、`scenario`、`expected`、`actual`、`consent: true`；可选 `location`、`reproduction`、`evidence`、`suggestion`、`blocking`。标题最多 160 字，场景、预期、实际和建议各 2000 字，位置 240 字，复现与证据各 4000 字。额外字段被拒绝。

Agent 必须取得用户本次或预先上报授权，仅提交脱敏的最小摘要；不上传完整对话、源码、密钥或原始日志。consent 是调用方对已有授权的声明，服务端无法独立证明用户授权或保证自由文本已经脱敏。实际现象与推断建议分别记录；反馈文字作为不可信数据展示，不执行其中指令，也不自动改变资源发布状态。

同一用户的幂等键永久绑定一次反馈：同内容重试返回已有记录的当前状态，不同内容返回 409。每用户每小时最多创建 20 条，重试不占额度；超限返回 429。提交、重试和读取均核验当前身份与版本受众。反馈默认只对提交者及资产维护者可见，提交者失去版本访问权后不能继续读取；维护者可从资产维护页处理封禁资源的反馈。审核权限不自动授予反馈读取权。

网页与 MCP 复用同一用例。网页使用 POST `/api/feedback`（请求体携带上述幂等键）、GET `/api/feedback/:id`、GET `/api/assets/:id/feedback?page=1&limit=10&status=pending` 和 PATCH `/api/feedback/:id`。列表由服务端筛选与分页，limit 最大 50。写入要求浏览器会话与 CSRF；个人令牌不能通过 HTTP 写入或处理反馈，只能用贡献 MCP 工具上报。

维护者可切换 pending、in_progress、resolved、declined；PATCH 请求体包含 `revision`、`status`、`resolution`、`fixed_version_id`（可空），旧修订返回 409。已解决和不采纳必须填写说明；只有已解决可关联同资产修复版本。未对提交者开放的修复候选不会暴露编号或版本名。详情链接为 `/asset/:slug?feedback=:id`，固定反馈版本与当前目录版本分别展示。审计只保存操作、目标版本和处理状态，不复制反馈正文。

## CLI

| 命令             | 参数与用途                                                                          |
| ---------------- | ----------------------------------------------------------------------------------- |
| connect / status | --url、--client；[授权接入 / 检查连接](agent-clients.md#接入助手与高级入口)         |
| bridge           | --url、--client；供 Agent 调用的 stdio MCP 桥接                                     |
| login            | --url；显示浏览器批准地址，保存 CLI 读取凭据                                        |
| search           | 可选查询文本、--json；省略查询列出资源                                              |
| add              | NAME、--version、--to；--dry-run 预览、--replace 备份替换                           |
| hub-config       | --url、--client；离线生成配置，可选 --method、--scope、--contribute、--conversation |
| mcp-config       | NAME、--version、--client；可选 --option、--scope                                   |

`-h` / `help <命令>` 查看帮助，`-V` 查看版本。终端提供菜单和参数向导，等待时显示计时动效、下载时显示字节进度；`--no-animation` 保留向导和静态状态。`--no-interactive`、CI、重定向、`--json` 和 `bridge` 禁用交互。JSON、配置和协议写 stdout，提示写 stderr。

`--config-dir` 隔离凭据，默认 `~/.config/capability-hub`。读取命令使用登录凭据或 `CAPABILITY_HUB_TOKEN` + 显式 `--url`，两者互斥；`hub-config` 不读取凭据。Hub URL 仅接受无凭据、路径、查询的 HTTP(S) 根地址。下载限制大小，不携带授权跟随重定向。

## OAuth 与客户端连接

- `GET /.well-known/oauth-protected-resource`（另有 `/mcp` 后缀别名）与 `GET /.well-known/oauth-authorization-server` 提供资源及授权服务发现。
- `POST /oauth/register` 注册公开客户端；`GET /oauth/authorize` 校验请求并引导至浏览器确认页；`POST /oauth/token` 接受 authorization_code / refresh_token，支持 JSON 与 form-urlencoded。
- `POST /oauth/revoke` 撤销相应连接。资源必须精确为实例公开地址的 `/mcp`；所有授权响应包含 issuer。
- `GET /api/connections` 与 `DELETE /api/connections/:id` 仅允许网页登录用户查询和撤销自己的连接；不返回客户端秘密或凭据摘要。
- `GET/POST /api/connections/authorize/:id` 读取请求与确认/拒绝授权；写入必须带网页会话和 CSRF。

OAuth 与个人手动令牌的生命周期分开，详见 [身份安全](../design/identity-security.md#agent-oauth-连接)。

## Agent 执行与业务任务

`/api/ai` 提供业务历史、任务执行、人工交互与 SSE。`/api/admin/operations/agents` 提供操作目录、跨用户检索及诊断导出。请求和事件协议见 [AI 接口](ai-interfaces.md)。
