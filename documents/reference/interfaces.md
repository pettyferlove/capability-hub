# HTTP、MCP 与 CLI

## HTTP

HTTP 契约在 packages/contracts/src；http/ 目录按业务划分 Response，请求 Schema 由同包公开导出。请求体/查询在入口校验，错误返回 code、message、details、retryable 和 request_id；意外内部错误不暴露原文。响应已经开始时终止连接，错误仍只进入脱敏日志。

| 入口组                                                   | 用途                                   |
| -------------------------------------------------------- | -------------------------------------- |
| /api/auth/status、/auth/setup、/auth/login、/auth/logout | 初始化和浏览器认证                     |
| /auth/cli/request、/auth/cli/poll、/api/cli/approve      | 浏览器批准 CLI                         |
| /api/assets、/api/scenarios                              | 按当前受众发现与读取                   |
| /api/versions/:id/manifest、archive、files               | 已发布固定内容                         |
| /skills/:slug/:version、/mcp-servers/:slug/:version      | 人可读公开资源地址，按匿名权限         |
| /api/feedback、/api/assets/:id/feedback                  | 私有反馈提交、详情、处理与分页         |
| /api/management/*                                        | 维护和候选审查                         |
| /api/intakes、/api/sources、/api/publication-requests    | 接收、来源与审核                       |
| /api/me/*、/api/tokens、/api/git-credentials             | 个人资料、会话、令牌与仓库凭据         |
| /api/admin/*                                             | 账号、角色、审计及运行管理             |
| /api/hub-mcp-config、/connect/mcp                        | 首次接入配置与 Markdown 说明，无秘密值 |
| /api/hub-share、/INSTALL.md                              | 公开分享邀请与不预选客户端的接入引导   |
| /mcp                                                     | Hub MCP；需要有效身份                  |

需要修订的修改携带 If-Match，幂等用例携带 Idempotency-Key。Cookie 写入还需 CSRF。具体方法、参数与状态码以 server/http/routes 和 contracts 为准。

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
| rate_asset                    | 对固定版本推荐或取消推荐                             |

hub:read 不注册贡献工具；hub:contribute 按操作核对权限：分享需要创建/维护权限，推荐与反馈只要求有权读取对应版本。工具调用重新解析当前身份。配置输出的客户端标识与路径见 [Agent 客户端接入](agent-clients.md)。秘密变量由目标环境设置，runtime_client_verification 为 false，不声称目标连接已验证。install_skill 可通过 client 选择建议技能目录。

远程 MCP 的 Streamable HTTP 服务地址支持 HTTP 和 HTTPS，禁止 URL 内嵌账号密码。添加 HTTP 地址时，表单提示连接未经加密、适合可信内网，公网建议使用 HTTPS；该提示不阻止提交，也不增加审核确认项。

## 资源反馈

`report_asset_feedback` 支持 Skill/MCP，`kind` 为 defect（缺陷）、capability_gap（能力缺口）或 suggestion（建议）。必填 `version_id`、`idempotency_key`、`kind`、`title`、`scenario`、`expected`、`actual`、`consent: true`；可选 `location`、`reproduction`、`evidence`、`suggestion`、`blocking`。标题最多 160 字，场景、预期、实际和建议各 2000 字，位置 240 字，复现与证据各 4000 字。额外字段被拒绝。

Agent 必须取得用户本次或预先上报授权，仅提交脱敏的最小摘要；不上传完整对话、源码、密钥或原始日志。consent 是调用方对已有授权的声明，服务端无法独立证明用户授权或保证自由文本已经脱敏。实际现象与推断建议分别记录；反馈文字作为不可信数据展示，不执行其中指令，也不自动改变资源发布状态。

同一用户的幂等键永久绑定一次反馈：同内容重试返回已有记录的当前状态，不同内容返回 409。每用户每小时最多创建 20 条，重试不占额度；超限返回 429。提交、重试和读取均核验当前身份与版本受众。反馈默认只对提交者及资产维护者可见，提交者失去版本访问权后不能继续读取；维护者可从资产维护页处理封禁资源的反馈。审核权限不自动授予反馈读取权。

网页与 MCP 复用同一用例。网页使用 POST `/api/feedback`（请求体携带上述幂等键）、GET `/api/feedback/:id`、GET `/api/assets/:id/feedback?page=1&limit=10&status=pending` 和 PATCH `/api/feedback/:id`。列表由服务端筛选与分页，limit 最大 50。写入要求浏览器会话与 CSRF；个人令牌不能通过 HTTP 写入或处理反馈，只能用贡献 MCP 工具上报。

维护者可切换 pending、in_progress、resolved、declined；PATCH 请求体包含 `revision`、`status`、`resolution`、`fixed_version_id`（可空），旧修订返回 409。已解决和不采纳必须填写说明；只有已解决可关联同资产修复版本。未对提交者开放的修复候选不会暴露编号或版本名。详情链接为 `/asset/:slug?feedback=:id`，固定反馈版本与当前目录版本分别展示。审计只保存操作、目标版本和处理状态，不复制反馈正文。

## CLI

| 命令       | 必需参数                                          |
| ---------- | ------------------------------------------------- |
| login      | --url，终端显示浏览器批准地址                     |
| search     | 查询文本，可选 --json                             |
| add        | NAME、--version、--to；可选 --dry-run、--replace  |
| hub-config | --url、--client；可选 --scope、--conversation     |
| mcp-config | NAME、--version、--client，可选 --option、--scope |

所有命令支持 --config-dir；hub-config 是离线配置生成，不使用凭据目录或环境令牌。默认凭据位于用户 .config/capability-hub/auth.json。设置 CAPABILITY_HUB_TOKEN 时必须同时提供 --url，且不读取本地凭据。Hub URL 仅 HTTPS，loopback 可 HTTP；禁止控制字符、嵌入凭据和非根路径。JSON/下载有大小限制，重定向不携带授权继续跳转。

## OAuth 与客户端连接

- `GET /.well-known/oauth-protected-resource`（另有 `/mcp` 后缀别名）与 `GET /.well-known/oauth-authorization-server` 提供资源及授权服务发现。
- `POST /oauth/register` 注册公开客户端；`GET /oauth/authorize` 校验请求并引导至浏览器确认页；`POST /oauth/token` 接受 authorization_code / refresh_token，支持 JSON 与 form-urlencoded。
- `POST /oauth/revoke` 撤销相应连接。资源必须精确为实例公开地址的 `/mcp`；所有授权响应包含 issuer。
- `GET /api/connections` 与 `DELETE /api/connections/:id` 仅允许网页登录用户查询和撤销自己的连接；不返回客户端秘密或凭据摘要。
- `GET/POST /api/connections/authorize/:id` 读取请求与确认/拒绝授权；写入必须带网页会话和 CSRF。
- CLI `connect --url URL --client CLIENT` 完成助手授权、验证与配置；`bridge` 提供 stdio 到 Hub MCP 的连接；`status` 检查连接。配置范围、权限与文件覆盖参数见 [Agent 接入说明](agent-clients.md#接入助手与高级入口)。

OAuth 与个人手动令牌的生命周期分开，详见 [身份安全](../design/identity-security.md#agent-oauth-连接)。
