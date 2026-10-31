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

- Codex 使用 TOML 的 `mcp_servers`；Bearer 令牌引用 `bearer_token_env_var`，其他秘密 Header 使用 `env_http_headers`，stdio 环境变量通过 `env_vars` 传递。
- Claude Code、Cursor、Pi、Gemini CLI 和 Copilot CLI 使用 JSON 的 `mcpServers`。Claude Code 与 Copilot CLI 的 HTTP 条目含 `type: "http"`；Pi 由 `url` 选择 Streamable HTTP。
- OpenCode 使用 `mcp`，远程为 `type: "remote"`，本地为 `type: "local"`。本地 `command` 是包含可执行程序及参数的数组，环境字段为 `environment`。带显式 Authorization Header 的配置关闭自动 OAuth，普通业务 Header 保留 OAuth 探测，Hub 默认不生成 Authorization Header，从而保留原生 OAuth；仅高级手动令牌方式生成该 Header。
- Gemini CLI 使用 `httpUrl` 指定 Streamable HTTP；`url` 表示 SSE，不能互换。
- VS Code 使用顶层 `servers` 和明确的 `http` / `stdio` 类型。Copilot CLI 不读取这个格式，必须选择独立的 `copilot-cli` 适配。
- Cursor 与 VS Code 引用 `${env:NAME}`；OpenCode 引用 `{env:NAME}`；Claude Code、Pi、Gemini CLI 与 Copilot CLI 引用 `${NAME}`。真实值由运行客户端或连接服务的本机、远程主机或容器提供，不写入 Hub。

Pi 的原 `badlogic/pi-mono` 仓库当前重定向至 `earendil-works/pi`。本适配依据该官方仓库的原生 MCP 文档，需要安装具备该功能的版本；不为旧版本生成第三方扩展配置。项目配置还需要在客户端完成项目信任。

## 使用

Hub `/mcp` 同时接受现代 `2026-07-28` 协议和 `2025-03-26`、`2025-06-18`、`2025-11-25` 的 Streamable HTTP 握手，详见 [MCP 协议支持](interfaces.md#hub-mcp)。客户端应使用自身支持的协议协商，不要手工覆盖协议版本 Header。

在“连接你的 Agent”页选择客户端和配置范围，复制接入指令给 Agent。默认配置只有服务地址，使用客户端原生 OAuth；Codex 还显式选择 `hub:read`。在客户端发起登录，用户在 Hub 浏览器页面确认，凭据由客户端保存。已登录网页可以继续确认授权，不自动授予新客户端访问权限。

Codex 使用 `codex mcp login capability-hub --scopes hub:read`，OpenCode 使用 `opencode mcp auth capability-hub`；其他客户端从各自 MCP 设置发起授权。是否支持原生 OAuth 及具体操作取决于客户端版本，不能把配置生成视为真实产品验收。Hub 支持 DCR，不声明 CIMD 支持。

首次默认只授权搜索和使用。如需分享、推荐与反馈，在接入页勾选对应能力后重新复制指令；Codex 请求 `hub:read,hub:contribute`，助手使用 `--contribute`。浏览器再次明确批准后刷新工具列表。账号角色仍决定实际资源权限。

目标 MCP 自身的认证独立于 Hub 连接；Hub 凭据不会转发给目标服务。

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
请帮我将这个 Capability Hub 接入当前使用的 Agent：
https://hub.example.com/INSTALL.md
```

分享地址取自服务端配置的公开地址，不携带当前用户身份、令牌或页面查询参数。`GET /api/hub-share` 返回 `installation_url` 与 `prompt`；`GET /INSTALL.md` 直接返回无需登录的 Markdown。部署地址必须能被接收者的 Agent 访问。

通用说明引导 Agent 根据明确的运行上下文识别客户端，无法确定时再询问用户，并确认项目/用户范围。客户端列表复用现有定义，具体配置链接继续使用 `/connect/mcp?client=…&scope=…`，不另外维护配置模板。不支持的客户端转向手动接入页；未获得账号或资源权限的接收者需联系 Hub 管理员。

“连接你的 Agent”页可选择客户端及项目/用户范围，点击“复制 Hub 接入指令”。指令内包含配置合并、浏览器授权及验证步骤，不要求先调用尚未接入的 Hub 工具。授权完成后继续用户原来的检索或安装任务。公开资源原本允许匿名交付的，不要求先接入整个 Hub。

也可以把以下说明链接交给 Agent；链接无需登录即可读取，但不包含任何令牌，也不授予 MCP 或资源访问权限：

```text
请按此说明将 Capability Hub 接入我的 Pi：
https://hub.example.com/connect/mcp?client=pi&scope=project
```

目标 Agent 必须能访问部署地址。远程 Agent 中的 localhost 指向远程主机；若无法访问说明链接，可使用页面复制的完整指令。若当前客户端不能写入配置或需要重启，Agent 应说明用户需要完成的步骤，不声称已经连接。

CLI 的 `hub-config` 不读取本地凭据、不请求 Hub、不写配置文件，可以用于首次接入：

```sh
capability-hub hub-config --url https://hub.example.com --client pi --scope user
capability-hub hub-config --url https://hub.example.com --client pi --scope user --conversation
```

不带 `--conversation` 输出 JSON/TOML，带该参数输出完整对话指令。`GET /api/hub-mcp-config?client=pi&scope=user` 返回相同的配置与指令，`GET /connect/mcp?client=pi&scope=user` 返回 Markdown。两者使用服务器配置的公开地址，支持 `method=oauth|assistant|token`（默认 oauth）与 `permission=read|contribute`（默认 read），拒绝未知客户端、范围和额外参数；配置接口不创建凭据。Hub MCP 本身继续要求有效身份。

## 接入助手与高级入口

原生 OAuth 不可用时，先安装部署方提供的 Capability Hub CLI，再在运行 Agent 的同一环境执行：

```sh
capability-hub connect --url https://hub.example.com --client cursor --scope project
capability-hub status --url https://hub.example.com --client cursor
```

`connect` 先检查已有配置，再启动仅监听 loopback 的 PKCE 授权回调。默认尝试打开浏览器，也会输出授权链接；`--no-browser` 只输出链接。远程终端需要将提示的回调端口转发到浏览器所在机器；无法建立回调连接时优先使用客户端自身的远程 OAuth 流程。

助手先用临时私有凭据完成工具发现和检索，再合并配置并保存正式凭据；失败时保留原连接并尝试撤销未使用的新授权。不向 stdout、配置文件或对话输出凭据。配置中的 `bridge` 命令通过 stdio 向客户端提供 Hub 工具，通过 HTTP 连接 Hub，并自动刷新凭据。凭据按 Hub 地址和客户端隔离，默认保存在 `~/.config/capability-hub/connections/`，可使用 `--config-dir` 指定位置。相同客户端与 Hub 的不同项目共用该助手连接；不同客户端和原生 OAuth 连接独立撤销。

JSON/JSONC 合并保留其他设置与注释；TOML 新增普通表条目保留原文，内联表需要重新序列化。已有同名不同配置时拒绝覆盖，核对后可使用 `--replace`，写入前在 CLI 私有目录的 `config-backups/` 保存权限为 `0600` 的原文备份，避免配置中的秘密随项目提交；替换现有 TOML 条目会重新序列化文件，设置保留、注释保存在备份中。拒绝符号链接和特殊文件，检查读取后配置被其他程序修改的情况。

Claude Code 与 VS Code 的用户级配置位置由客户端管理，助手要求使用项目范围或通过 `--config-file` 明确文件路径。用户目录支持 Codex 的 `CODEX_HOME` 和 Copilot CLI 的 `COPILOT_HOME`；OpenCode 已有 JSONC 时优先保留。使用源码运行助手进行开发时，客户端桥接仍需要已构建的 CLI；部署分发应包含完整运行产物。

`status` 验证助手到 Hub 的真实工具发现；`connect` 还验证检索。它们不证明目标 Agent 已重载配置；最后仍须在目标 Agent 检查工具并继续原任务。缺少、过期或撤销的授权可以重新运行 `connect`；重复接入先复用有效授权。刷新与配置写入使用心跳锁，崩溃残留锁会自动回收。临时网络故障不会自动覆盖原授权；更换账号或授权后，运行中的桥接会要求重新加载，避免悄悄切换身份。

账号安全页和接入页展示已授权 Agent，可独立断开连接；“已授权，等待首次访问”与最近访问时间分开呈现。高级手动接入保留 `CAPABILITY_HUB_TOKEN` 配置及个人令牌创建，手动令牌长期有效、独立撤销，不属于 OAuth 刷新流程。

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
