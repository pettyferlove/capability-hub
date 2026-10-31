# Capability Hub

团队 Skill 与 MCP 描述的登记、扫描、独立审核和分发平台。内容发布后按固定版本交付，访问权限在每次读取时判断。

- Web：公开发现、内容阅读与下载；登录后管理来源、提交发布、审核及账号权限。
- HTTP / Hub MCP：检索可见资源、读取固定内容、交付安装材料及生成客户端配置。
- CLI：浏览器批准登录、搜索、校验归档并安装 Skill，或输出 MCP 配置。

Hub 不执行上传的脚本，也不代替客户端连接目标 MCP 服务。

## 本地运行

要求 Node.js **24.22.1**、pnpm **10.33.0**，Git 和 OpenSSH 用于 Git 来源及 SSH 凭据。

```sh
nvm use
pnpm install --frozen-lockfile
cp .env.example .env
pnpm dev
```

服务默认监听 `127.0.0.1:4100`，使用 SQLite 和本地内容目录。另一个终端运行 `pnpm dev:web`，访问 `http://127.0.0.1:5173`。在页面完成首个账号初始化。

```sh
pnpm check
pnpm test:external
pnpm build
pnpm start
```

`check` 包含架构、类型感知 lint、格式、类型、构建及默认测试。外部集成测试使用本机 Docker 创建隔离 PostgreSQL、MinIO 和 SSH Git 服务，结束后清理自身资源。`start` 使用已编译的服务及 Web 产物。

## 工程结构

| 目录                      | 职责                                   |
| ------------------------- | -------------------------------------- |
| `apps/server`             | Express HTTP、MCP、装配和持久任务执行  |
| `apps/web`                | React 页面与交互                       |
| `apps/cli`                | 消费者命令行                           |
| `packages/contracts`      | 请求校验、响应协议和浏览器安全共享类型 |
| `packages/domain`         | 业务模型、规则与规范化算法             |
| `packages/application`    | 用例、命令、查询和外部能力端口         |
| `packages/infrastructure` | 数据库、对象存储、Git、扫描和安全实现  |
| `packages/logging`        | 独立服务端与浏览器日志入口             |

工程及运维说明统一维护在 [documents](documents/README.md)。开发约束见 [AGENTS.md](AGENTS.md)。

数据库由 Drizzle Kit 生成迁移，启动时应用待执行变更并校验迁移历史；不转换未纳入当前迁移体系的旧数据库。开发命令与原生 SQL 审查要求见[数据库迁移](documents/development/database-migrations.md)。
