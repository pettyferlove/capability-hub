# Agent 客户端接入

资料核对日期：2026-10-30。Hub 支持下列八种客户端的配置生成；页面、HTTP API、CLI 和 Hub MCP 使用同一份客户端定义。本文描述配置格式，不代表已经在真实客户端完成连接验收。

## 客户端与配置位置

| 客户端             | `--client`    | 项目 MCP 配置                              | 用户 MCP 配置                                                  | 项目 Skill 安装目录 |
| ------------------ | ------------- | ------------------------------------------ | -------------------------------------------------------------- | ------------------- |
| Codex              | `codex`       | `.codex/config.toml`                       | `~/.codex/config.toml`                                         | `.agents/skills`    |
| Claude Code        | `claude-code` | `.mcp.json`                                | 通过 `claude mcp add --scope user` 登记                        | `.claude/skills`    |
| Cursor             | `cursor`      | `.cursor/mcp.json`                         | `~/.cursor/mcp.json`                                           | `.cursor/skills`    |
| OpenCode           | `opencode`    | `opencode.json`，已有 JSONC 时合并到原文件 | `~/.config/opencode/opencode.json`                             | `.opencode/skills`  |
| Pi                 | `pi`          | `.pi/mcp.json`                             | `~/.pi/agent/mcp.json`                                         | `.agents/skills`    |
| Gemini CLI         | `gemini-cli`  | `.gemini/settings.json`                    | `~/.gemini/settings.json`                                      | `.gemini/skills`    |
| VS Code            | `vscode`      | `.vscode/mcp.json`                         | 命令面板 `MCP: Open User Configuration`                        | `.github/skills`    |
| GitHub Copilot CLI | `copilot-cli` | `.mcp.json`                                | `~/.copilot/mcp-config.json`，设置 `COPILOT_HOME` 时使用该目录 | `.github/skills`    |

目录表示安装父目录；完整技能保存在 `<目录>/<资源名>/SKILL.md` 及同目录的附属文件中。表中选择一种官方支持的位置，不穷举所有发现路径。VS Code 的 Skill 目录按 Copilot 工作流给出；选择其他 Agent harness 时应使用相应客户端的目录。自定义配置根目录和远程开发环境以目标客户端实际设置为准。

## 配置差异

- Codex 使用 TOML 的 `mcp_servers`。自备 Bearer Token 用 `bearer_token_env_var`，其他自备密钥用 `env_http_headers`，Hub 共享凭据用 `http_headers`，stdio 环境变量用 `env_vars`。
- Claude Code、Cursor、Pi、Gemini CLI 和 Copilot CLI 使用 JSON 的 `mcpServers`。Claude Code 与 Copilot CLI 的 HTTP 条目含 `type: "http"`；Pi 由 `url` 选择 Streamable HTTP。
- OpenCode 使用 `mcp`，远程为 `type: "remote"`，本地为 `type: "local"`。本地 `command` 是包含可执行程序及参数的数组，环境字段为 `environment`。带显式 Authorization Header 的配置关闭自动 OAuth，普通业务 Header 保留 OAuth 探测，Hub 默认不生成 Authorization Header，从而保留原生 OAuth；仅高级手动令牌方式生成该 Header。
- Gemini CLI 使用 `httpUrl` 指定 Streamable HTTP；`url` 表示 SSE，不能互换。
- VS Code 使用顶层 `servers` 和明确的 `http` / `stdio` 类型。Copilot CLI 不读取这个格式，必须选择独立的 `copilot-cli` 适配。
- 使用者自备的环境变量由客户端读取。Cursor 与 VS Code 引用 `${env:NAME}`，OpenCode 引用 `{env:NAME}`，Claude Code、Pi、Gemini CLI 与 Copilot CLI 引用 `${NAME}`。

Pi 的原 `badlogic/pi-mono` 仓库当前重定向至 `earendil-works/pi`。本适配依据该官方仓库的原生 MCP 文档，需要安装具备该功能的版本；不为旧版本生成第三方扩展配置。项目配置还需要在客户端完成项目信任。

## 使用

Hub `/mcp` 同时接受现代 `2026-07-28` 协议和 `2025-03-26`、`2025-06-18`、`2025-11-25` 的 Streamable HTTP 握手，详见 [MCP 协议支持](interfaces.md#hub-mcp)。客户端应使用自身支持的协议协商，不要手工覆盖协议版本 Header。

在“连接你的 Agent”页选择客户端和配置范围，复制接入指令。默认使用原生 OAuth 申请读取权限，用户在浏览器确认。Codex 用 `scopes`，OpenCode 与 Pi 用 `oauth.scope`，Gemini CLI 用 `oauth.scopes`。

Codex 使用 `codex mcp login capability-hub --scopes hub:read`，OpenCode 使用 `opencode mcp auth capability-hub`；其他客户端从各自 MCP 设置发起授权。是否支持原生 OAuth 及具体操作取决于客户端版本，不能把配置生成视为真实产品验收。Hub 支持 DCR，不声明 CIMD 支持。

分享 Skill、推荐或反馈时再追加 `hub:contribute`。上述四种适配直接请求相应范围，其他适配提供接入助手的 `--contribute` 指令。用户勾选授权后刷新工具列表，账号权限仍决定可操作的资源。

客户端直接连接目标 MCP。同一资产、完整服务地址、请求头和认证方式共用绑定，改回自备凭据须在维护设置中移除绑定。团队 Bearer Token 只填原值，Hub 生成 `Authorization: Bearer <token>`。将安装配置保存到客户端的用户配置，轮换后重新获取并加载。已分发的旧凭据需在目标服务撤销。

```sh
capability-hub login --url https://hub.example.com
capability-hub mcp-config example-service --version 1.0.0 --client opencode --option remote-1 --url https://hub.example.com
capability-hub add example-skill --version 1.0.0 --to .opencode/skills --dry-run --url https://hub.example.com
```

示例资源名、版本与安装项需替换为实际发布内容。CLI 的配置 JSON/TOML 写到 stdout，目标位置、变量说明和客户端提示写到 stderr。CLI 默认生成项目配置，也可指定 `--scope user`；HTTP 与 Hub MCP 使用 `scope: "user"`。

`get_mcp_config` 与 `activate_mcp` 的 `client` 接受表中的八个标识。`install_skill` 可提供同样的可选 `client`，使 `suggested_directory` 匹配客户端；省略时仍建议 `.agents/skills/<资源名>`，实际位置由使用者确认。

Hub 生成 Streamable HTTP 远程配置和固定版本 npm stdio 配置，不运行目标服务，不覆盖客户端已有设置。复杂 URL 模板、多变量 Header、环境变量模板、自定义运行时参数和可变包参数明确拒绝，不猜测参数。固定值中会被目标客户端展开的环境/文件表达式不直接透传；Pi 的命令求值同样拒绝。`runtime_client_verification` 始终为 `false`。

## 通过对话接入 Hub 自身

全站顶栏的“分享 Hub”会打开邀请卡，复制以下简短提示词，无需分享者预选客户端或配置范围：

```text
请按照以下安装指南，为当前 Agent 配置 Capability Hub：
https://hub.example.com/INSTALL.md
```

分享邀请只包含接入请求和实例公开链接。`GET /api/hub-share` 返回 `installation_url` 与 `prompt`，`GET /INSTALL.md` 匿名交付 Markdown。

接入说明按任务与运行能力选择 MCP 或独立 CLI，先验证并复用同一实例的可用通路。MCP 在目标 Agent 调用 `search_skills`；CLI 用显式 `--url` 的 `search --json` 验证。预设表提供快捷配置；未知客户端按自身 Streamable HTTP 与认证能力接入，或用 CLI 搜索、安装 Skill。

接入说明和 MCP 工具发现均指向随附的 [use-capability-hub](../../skills/use-capability-hub/SKILL.md) 及参考资料。仅推荐 `active`、当前版本公开且完整清单与摘要均匹配的目录版本；否则按 `/INSTALL.md` 下载并校验随附完整包，目录查询失败也可安装。

也可以把以下说明链接交给 Agent；链接无需登录即可读取，但不包含任何令牌，也不授予 MCP 或资源访问权限：

```text
请按此说明将 Capability Hub 接入我的 Pi：
https://hub.example.com/connect/mcp?client=pi&scope=project
```

目标运行环境必须能访问部署地址，远程或容器中的 localhost 指向该环境自身。无法读取说明时可转交完整指令；不能写入配置或完成重载时，说明待完成步骤。CLI 可访问不代表 Agent 已连接 MCP。

CLI 的 `hub-config` 不读取本地凭据、不请求 Hub、不写配置文件，可以用于首次接入：

```sh
capability-hub hub-config --url https://hub.example.com --client pi --scope user
capability-hub hub-config --url https://hub.example.com --client pi --scope user --conversation
```

不带 `--conversation` 输出 JSON/TOML，带该参数输出完整对话指令。`GET /api/hub-mcp-config?client=pi&scope=user` 返回相同的配置与指令，`GET /connect/mcp?client=pi&scope=user` 返回 Markdown。两者使用服务器配置的公开地址，支持 `method=oauth|assistant|token`（默认 oauth）与 `permission=read|contribute`（默认 read），拒绝未知客户端、范围和额外参数；配置接口不创建凭据。Hub MCP 本身继续要求有效身份。

## 接入助手与高级入口

实例的 `/connect/cli` 提供安装及独立 CLI 授权步骤；私有仓库参数临时覆盖已有作用域设置，仓库认证与 Hub 授权独立。`login/search/add` 无需客户端标识；CLI 暂无正文读取或贡献命令。接入助手仅适用于表中客户端，在 Agent 运行环境执行：

```sh
capability-hub connect --url https://hub.example.com --client cursor --scope project
capability-hub status --url https://hub.example.com --client cursor
```

`connect` 先检查已有配置，再启动仅监听 loopback 的 PKCE 授权回调。默认尝试打开浏览器，也会输出授权链接；`--no-browser` 只输出链接。远程终端需要转发回调端口；无法建立回调时，按 `/INSTALL.md` 选择可用方式。独立 CLI 的 `login` 使用设备码轮询，无需本机回调。

助手先用临时私有凭据完成工具发现和检索，再合并配置并保存正式凭据；失败时保留原连接并尝试撤销未使用的新授权。不向 stdout、配置文件或对话输出凭据。配置中的 `bridge` 命令通过 stdio 向客户端提供 Hub 工具，通过 HTTP 连接 Hub，并自动刷新凭据。凭据按 Hub 地址和客户端隔离，默认保存在 `~/.config/capability-hub/connections/`，可使用 `--config-dir` 指定位置。相同客户端与 Hub 的不同项目共用该助手连接；不同客户端和原生 OAuth 连接独立撤销。

JSON/JSONC 合并保留其他设置与注释；TOML 新增普通表条目保留原文，内联表需要重新序列化。已有同名不同配置时拒绝覆盖，核对后可使用 `--replace`，写入前在 CLI 私有目录的 `config-backups/` 保存权限为 `0600` 的原文备份，避免配置中的秘密随项目提交；替换现有 TOML 条目会重新序列化文件，设置保留、注释保存在备份中。拒绝符号链接和特殊文件，检查读取后配置被其他程序修改的情况。

Claude Code 与 VS Code 的用户配置由客户端管理。将实际文件路径填入助手命令的 `--config-file`，交互终端也可按提示输入。Codex 和 Copilot CLI 分别支持 `CODEX_HOME` 和 `COPILOT_HOME`，OpenCode 优先沿用已有 JSONC。桥接需要已构建的 CLI。

`status` 验证助手到 Hub 的真实工具发现；`connect` 还验证检索。它们不证明目标 Agent 已重载配置；最后仍须在目标 Agent 检查工具并继续原任务。缺少、过期或撤销的授权可以重新运行 `connect`；重复接入先复用有效授权。刷新与配置写入使用心跳锁，崩溃残留锁会自动回收。临时网络故障不会自动覆盖原授权；更换账号或授权后，运行中的桥接会要求重新加载，避免悄悄切换身份。

账号安全页和接入页可逐个断开已授权的 Agent。列表显示每个连接的权限和最近访问时间，尚未使用时显示“等待首次访问”。高级手动接入保留 `CAPABILITY_HUB_TOKEN` 配置及个人令牌创建，手动令牌长期有效、独立撤销，不属于 OAuth 刷新流程。

## 官方依据

| 客户端      | MCP 与配置                                                                                                                                                                                           | Skill                                                                                                    |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Codex       | [MCP](https://developers.openai.com/codex/mcp/)                                                                                                                                                      | [Agent Skills](https://developers.openai.com/codex/skills/)                                              |
| Claude Code | [MCP](https://code.claude.com/docs/en/mcp)                                                                                                                                                           | [Skills](https://code.claude.com/docs/en/skills)                                                         |
| Cursor      | [MCP](https://cursor.com/docs/context/mcp)                                                                                                                                                           | [Agent Skills](https://cursor.com/docs/skills)                                                           |
| OpenCode    | [MCP servers](https://opencode.ai/docs/mcp-servers/) · [配置与环境变量](https://opencode.ai/docs/config/)                                                                                            | [Agent Skills](https://opencode.ai/docs/skills/)                                                         |
| Pi          | [官方 MCP 文档](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/mcp.md)                                                                                                    | [官方 Skills 文档](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/skills.md)  |
| Gemini CLI  | [MCP servers](https://geminicli.com/docs/tools/mcp-server/) · [settings 环境变量](https://geminicli.com/docs/reference/configuration/)                                                               | [管理 Agent Skills](https://geminicli.com/docs/cli/using-agent-skills/)                                  |
| VS Code     | [MCP 配置参考](https://code.visualstudio.com/docs/agents/reference/mcp-configuration)                                                                                                                | [Agent Skills](https://code.visualstudio.com/docs/agent-customization/agent-skills)                      |
| Copilot CLI | [添加 MCP servers](https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-mcp-servers) · [环境引用格式](https://code.visualstudio.com/docs/agents/reference/mcp-configuration) | [添加 Agent Skills](https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-skills) |

## 验证边界

自动化覆盖配置字段、参数边界、变量引用、项目/用户位置、HTTP 权限与撤销、MCP 工具发现、CLI 输出和页面选择行为。官方 SDK 协议测试不能证明这些产品均兼容 Hub 当前协议。

真实验收需分别在目标客户端设置变量、合并配置、完成项目信任、重新加载并确认工具列表，再搜索一份有权限的资源。Skill 还需确认完整目录实际写入且能被客户端发现。未做这些步骤时只能报告“配置已生成”。
