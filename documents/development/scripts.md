# 脚本分类与入口

脚本按职责存放，常用操作通过根目录 `package.json` 的 pnpm 命令执行。源码目录分类不改变容器内 `scripts/*.js` 运维入口。

`.mjs` 保留现有命令编排和运行环境入口；TS 用于原有类型化运维代码，以及需要类型检查、复用或独立测试的检查逻辑。文档和数据库检查保留 `.mjs` 入口，借助命令中声明的 `--import tsx` 加载必要的 TS 辅助模块，不要求先构建工作区。不会为统一扩展名而迁移其他脚本。

## 构建：`scripts/build`

| 脚本                                                                   | 职责与调用方                                                    |
| ---------------------------------------------------------------------- | --------------------------------------------------------------- |
| [clean-package.mjs](../../scripts/build/clean-package.mjs)             | 工作区构建前清理当前包的 `dist`；由各包 build 命令调用。        |
| [bundle-cli.mjs](../../scripts/build/bundle-cli.mjs)                   | CLI build 使用 esbuild 合并所需代码，不声明运行时依赖。         |
| [copy-runtime-assets.mjs](../../scripts/build/copy-runtime-assets.mjs) | 复制基础设施包运行所需的数据库迁移资产；由该包 build 命令调用。 |

CLI 的 `prepack` 自动构建；发布用 `pnpm --filter @capability-hub/cli publish --registry=<私服地址>`，不递归发布内部包。`pack --pack-destination <目录>` 可生成离线安装包。

## 工程检查：`scripts/checks`

| 脚本                                                                    | 职责与调用方                                               |
| ----------------------------------------------------------------------- | ---------------------------------------------------------- |
| [check-architecture.ts](../../scripts/checks/check-architecture.ts)     | `pnpm check:architecture`；检查分层、导出和依赖关系。      |
| [check-documentation.mjs](../../scripts/checks/check-documentation.mjs) | `pnpm check:documentation`；检查 Markdown 链接。           |
| [check-database.mjs](../../scripts/checks/check-database.mjs)           | `pnpm db:check`；在临时目录编排 Drizzle 检查和迁移树比较。 |
| [check-lint.mjs](../../scripts/checks/check-lint.mjs)                   | `pnpm lint`；分批串行执行 ESLint，失败即停止。             |
| [lib/documentation.ts](../../scripts/checks/lib/documentation.ts)       | 可独立测试的 Markdown 链接检查函数。                       |
| [lib/migration-files.ts](../../scripts/checks/lib/migration-files.ts)   | 迁移目录摘要和 journal 对应关系校验函数。                  |
| [lib/style-policy.ts](../../scripts/checks/lib/style-policy.ts)         | 默认测试使用的样式字面量和主题解析函数。                   |

`lib` 中的模块不自行启动命令或设置退出码。

## 数据库生成配置：`scripts/database`

| 脚本                                                                  | 职责与调用方                                               |
| --------------------------------------------------------------------- | ---------------------------------------------------------- |
| [drizzle-sqlite.ts](../../scripts/database/drizzle-sqlite.ts)         | `pnpm db:generate:sqlite` 使用的 SQLite 生成配置。         |
| [drizzle-postgresql.ts](../../scripts/database/drizzle-postgresql.ts) | `pnpm db:generate:postgresql` 使用的 PostgreSQL 生成配置。 |

这两个文件仅用于生成配置；实际迁移执行入口属于运维脚本。

## 运维：`scripts/operations`

| 脚本                                                              | 职责与调用方                                          |
| ----------------------------------------------------------------- | ----------------------------------------------------- |
| [runtime.ts](../../scripts/operations/runtime.ts)                 | 运维命令共用的配置、存储打开与关闭逻辑。              |
| [migrate.ts](../../scripts/operations/migrate.ts)                 | `pnpm db:migrate`；执行当前数据库迁移。               |
| [backup.ts](../../scripts/operations/backup.ts)                   | `pnpm backup`；导出记录和引用的内容对象。             |
| [restore-import.ts](../../scripts/operations/restore-import.ts)   | `pnpm restore:import`；校验并导入备份。               |
| [restore-check.ts](../../scripts/operations/restore-check.ts)     | `pnpm restore:check`；核验恢复内容及任务状态。        |
| [maintenance.ts](../../scripts/operations/maintenance.ts)         | `pnpm maintenance`；执行存储维护。                    |
| [recover-account.ts](../../scripts/operations/recover-account.ts) | `pnpm account:recover`；通过现有恢复流程处理账号。    |
| [healthcheck.mjs](../../scripts/operations/healthcheck.mjs)       | 容器健康探测；由 Docker HEALTHCHECK 或 Compose 调用。 |

TS 运维脚本由 `tsconfig.operations.json` 编译到 `dist/operations`，镜像复制到 `/app/scripts`；健康探测直接复制 `.mjs`。工程检查和开发测试辅助模块不进入该运维产物目录。

## 环境约束：`scripts/setup`

| 脚本                                                     | 职责与调用方                                                      |
| -------------------------------------------------------- | ----------------------------------------------------------------- |
| [require-pnpm.mjs](../../scripts/setup/require-pnpm.mjs) | preinstall 校验项目指定的 pnpm 版本；无需 TS 加载器或已安装依赖。 |

## 测试与验收：`scripts/testing`

| 脚本                                                                         | 职责与调用方                                                       |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| [run-tests.mjs](../../scripts/testing/run-tests.mjs)                         | `pnpm test`；发现测试文件并启动 Node 测试进程，也供外部测试调用。  |
| [register-test-runtime.mjs](../../scripts/testing/register-test-runtime.mjs) | 测试进程加载统一的 TS/JSX 编译配置。                               |
| [test-external.mjs](../../scripts/testing/test-external.mjs)                 | `pnpm test:external`；管理隔离的本机 Docker 测试依赖与清理。       |
| [verify-image.mjs](../../scripts/testing/verify-image.mjs)                   | `pnpm test:image <镜像标签>`；验收已构建镜像的运行资产与服务行为。 |

移动脚本时同步更新包命令、相对路径、测试导入、编译根目录和 Docker COPY 来源；不保留重复入口或旧路径转发文件。分类调整通过现有检查与构建验证，不为目录结构本身增加测试。
