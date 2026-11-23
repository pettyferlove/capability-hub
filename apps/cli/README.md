# Capability Hub CLI

从已有的 Capability Hub 实例搜索可见资源、校验并安装固定版本的 Skill，或为 Agent 客户端生成 MCP 配置。CLI 不启动 Hub，也不执行 Skill 内的脚本。

## 安装

需要 Node.js `>=22.12.0`。无需克隆仓库：

```sh
npm install -g @capability-hub/cli
capability-hub --cli-version
```

## 登录与查找

将 `https://hub.example.com` 换成你的 Hub 地址。按终端提示在浏览器确认授权后，CLI 保存该实例的读取凭据；Hub 登录和 npm 仓库认证彼此独立。

```sh
capability-hub login --url https://hub.example.com
capability-hub search "code review"
capability-hub show example-skill --version 1.0.0
```

将示例资源名和版本换成目录中的实际值。脚本可注入 `CAPABILITY_HUB_TOKEN`，为联网命令显式传入 `--url`；需要结构化搜索结果时加 `--json`。

## 安装与管理 Skill

在项目根目录运行。`--to` 指向客户端的 Skill 安装父目录，以下以 Codex 的 `.agents/skills` 为例：

```sh
capability-hub add example-skill --version 1.0.0 --to .agents/skills --dry-run
```

核对预览后，去掉 `--dry-run` 安装。目标目录已存在时须显式加 `--replace`，旧目录保留为备份。安装公开 Skill 可跳过登录，改为在 `add` 命令中显式传入 `--url`。

- `capability-hub list --to .agents/skills`：离线查看安装记录和本地改动。
- `capability-hub outdated --to .agents/skills`：检查是否有更新，不改写安装目录。
- `capability-hub remove example-skill --to .agents/skills`：移除有安装记录的 Skill；存在本地改动时须显式加 `--force`。

## 接入 Agent

例如，在 Cursor 打开的项目根目录运行：

```sh
capability-hub connect --url https://hub.example.com --client cursor --scope project
capability-hub status --url https://hub.example.com --client cursor
```

`connect` 在浏览器授权后合并客户端配置。`status` 检查 CLI 到 Hub 的连接；仍需在 Cursor 中重新加载配置并检查工具列表。

只想输出配置、不写文件时，用 `hub-config` 生成 Hub 自身的 MCP 配置，或用 `mcp-config` 读取目录中某个 MCP 资源的固定版本配置：

```sh
capability-hub hub-config --url https://hub.example.com --client cursor --scope project
capability-hub mcp-config example-service --version 1.0.0 --client cursor
```

## 命令帮助

```sh
capability-hub --help
capability-hub help add
```

在交互终端运行不带子命令的 `capability-hub` 可打开菜单。
