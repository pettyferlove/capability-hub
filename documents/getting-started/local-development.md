# 本地开发

从仓库根目录执行：

```sh
nvm use
pnpm install --frozen-lockfile
cp .env.example .env
pnpm dev
```

另开终端执行 `nvm use && pnpm dev:web`，页面为 `http://127.0.0.1:5173`，Vite 将 API、认证、公开资源和 MCP 路径转到 `127.0.0.1:4100`。首次在页面创建管理员和初始维护团队。

开发服务仅绑定 loopback。默认 SQLite 数据库位于 .data/hub.sqlite，内容位于 .data/blobs；未显式配置时生成私有 instance.key。路径相对仓库解析，不随启动工作目录变化。数据与密钥不入库。

服务直接托管构建后的页面：

```sh
pnpm build
pnpm start
```

本地 CLI 使用源码入口：

```sh
pnpm cli login --url http://127.0.0.1:4100
pnpm cli search TypeScript
```

终端显示批准链接和授权码，使用自己的浏览器打开并确认。网页登录与终端凭据分别管理。

修改后运行 `pnpm check`。需要真实 PostgreSQL、MinIO 和 SSH Git 时运行 `pnpm test:external`；该命令只使用随机隔离资源，不读写现有开发数据。

数据库结构修改后执行 `pnpm db:generate`，审查 SQL，再执行 `pnpm db:migrate`。服务启动也会执行待应用迁移。`pnpm db:check` 校验快照并检测遗漏变更，已包含在 `pnpm check` 中。原生触发器和双后端维护要求见[数据库迁移](../development/database-migrations.md)。
