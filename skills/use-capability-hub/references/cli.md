# 通过 CLI 搜索和安装

先读实例的 `/connect/cli`，在 Agent 实际执行命令的环境准备 CLI。`HUB_URL` 使用当前实例地址，资源名、版本和目录使用已确认值。

- 用 `capability-hub search "关键词" --url "HUB_URL" --json --no-interactive` 搜索并验证；成功返回空列表也算可用。已有有效登录时直接使用，仅缺少或失效授权时运行 `capability-hub login --url "HUB_URL" --no-interactive`，由用户在浏览器核对授权码并批准，不读取或回显凭据。
- 明确要求安装时，用 `capability-hub add NAME --version VERSION --to "PATH" --url "HUB_URL" --dry-run --no-interactive` 预览；`--to` 指定父目录，实际写入其下的 `<slug>/`。核对目录与差异后去掉 `--dry-run` 安装，已有内容按[本地写入](../SKILL.md#本地写入)处理。
- CLI 没有正文读取或贡献命令，搜索摘要不能当作正文。需要正文时通过 [MCP](mcp.md) 或固定版本的公开说明读取；无法取得时说明缺口，不为仅读取擅自持久安装。
