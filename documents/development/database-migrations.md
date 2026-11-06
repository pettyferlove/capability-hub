# 数据库结构与迁移

数据库结构使用 Drizzle ORM 声明，Drizzle Kit 生成 SQL、快照和迁移日志；运行时使用 Drizzle 官方 migrator 执行同一份迁移文件。SQLite 与 PostgreSQL 各维护独立的一套结构和迁移历史。

## 文件职责

- `packages/infrastructure/src/persistence/{sqlite,postgresql}/schema.ts`：表、生成列、唯一约束、外键、检查约束和索引的完整声明，也是运行时查询使用的表对象。
- 同目录的 `record-schema.ts`：通用 RecordStore 查询的类型视图，不另建表定义。
- 同目录的 `migrations/0000_init.sql`：该后端唯一的完整初始化迁移，包含生成结构、原生 SQL 守卫和修订计数初始行。
- `migrations/meta/`：Kit 管理的快照与 `_journal.json`，和 SQL 一起提交。
- `scripts/database/drizzle-sqlite.ts`、`scripts/database/drizzle-postgresql.ts`：生成配置，不需要数据库连接，也不读取开发库。

不再维护手写版本号或独立初始化 SQL。未使用当前迁移历史的数据库没有导入、基线标记、转换或兼容路径；开发时应显式选择新的数据目录或空数据库。迁移命令不会删除已有数据。

## 开发流程

从仓库根目录使用满足 engines 的 Node 和 pnpm：

```sh
# 1. 修改两个后端的 schema.ts，随后分别生成带有业务名称的迁移
pnpm db:generate:sqlite --name=add_example
pnpm db:generate:postgresql --name=add_example

# 也可一次生成两种后端的变更，使用 Kit 的默认文件名
pnpm db:generate

# 2. 审查 SQL；检查快照一致性和是否遗漏生成
pnpm db:check

# 3. 读取 .env，向选定的数据库执行待应用迁移
pnpm db:migrate

# 4. 验证行为和两种真实后端
pnpm check
pnpm test:external
```

`db:check` 在临时副本上运行 Kit 的 `check` 与 `generate`，发现 Schema 与快照差异即失败，不改工作区和数据库。它已纳入 `pnpm check`。生成命令不连接数据库；执行命令沿用服务的 `CAPABILITY_HUB_DATABASE_DRIVER`、`CAPABILITY_HUB_DATABASE_URL`、`CAPABILITY_HUB_DATA_DIR` 等配置，默认目标为 `.data/hub.sqlite`。

迁移执行命令复用应用启动的官方 migrator 入口，因此与服务拥有相同的事务、互斥锁和历史校验。它不启动 HTTP、Worker 或对象存储连接。生产镜像内可以执行 `node scripts/migrate.js`，无须安装 Drizzle Kit 或 tsx。

## 原生 SQL 与审查

Kit 不描述触发器、PostgreSQL 函数、延迟外键属性和 SQLite `STRICT`。这些原生定义直接维护在迁移 SQL 中；初始迁移已包含全部业务守卫、不可变约束、目录修订触发器和 `assets` 到 `releases` 的延迟复合外键。

只修改原生对象时，生成自定义迁移，再填写 SQL：

```sh
pnpm db:generate:sqlite --custom --name=update_guard
pnpm db:generate:postgresql --custom --name=update_guard
```

每条完整语句之间使用 `--> statement-breakpoint`；触发器的 `BEGIN … END`、函数的 `$$ … $$` 必须保持为一条语句。禁止按分号拆开函数或触发器。

审查生成结果时：

- SQLite 新建或重建业务表需要保留 `STRICT`；重建表需要恢复对应触发器、索引和延迟外键。涉及此类变更时，应审查并修订生成 SQL，必要时改用自定义迁移。
- PostgreSQL 重建 `assets` 的当前发布外键时保留 `DEFERRABLE INITIALLY DEFERRED`，否则会破坏发布事务。
- SQLite 调度索引使用 `state`、`run_after` 生成列，避免当前 Kit 对带逗号表达式索引的错误生成。
- 当前执行入口将迁移放在事务中；不能直接使用要求事务外执行的操作，例如 PostgreSQL `CREATE INDEX CONCURRENTLY`。

已应用的迁移不可编辑、重排、重新格式化或删除。Prettier 排除迁移目录，避免改变 SQL 校验摘要。每个后端以 `0000_init` 初始化基础业务表，`0001_ai_runtime` 添加 AI 框架表，`0002_identity_providers` 将用户名唯一约束限定到各自认证来源，`0003_asset_recommendations` 按用户和资源保留最早的推荐。修复通过新迁移完成。

## 执行与失败语义

SQLite 使用 `BEGIN IMMEDIATE`，PostgreSQL 在事务内持有 advisory lock；并发启动串行应用迁移。SQL 与迁移历史同事务提交，失败整体回滚，服务启动失败而不会继续使用部分结构。

执行前校验数据库迁移历史是否为当前文件的完整前缀，包含时间戳和 SHA-256 摘要；历史被改写、缺失中间记录或数据库版本领先于程序时拒绝打开。迁移后的 `hub_revision` 只用于业务目录修订，不承担数据库结构版本管理。

服务启动也会应用待执行迁移。部署前需审查变更、备份并评估锁表与停机窗口；多实例发布时先完成迁移再启动新实例。外部测试使用随机隔离数据库，不迁移当前开发库或生产库。
