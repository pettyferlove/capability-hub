# 持久化与任务设计

## RecordStore

应用层定义异步 RecordStore；Drizzle 实现在 infrastructure。记录以类型化模型读写，写入前、读取数据库 JSON 时以及导入外部快照时，均按当前每表结构校验；校验失败同样使所属事务整体回滚。连接、ORM schema、查询和事务不暴露给用例。

| 分组       | 记录                                                               |
| ---------- | ------------------------------------------------------------------ |
| 身份       | users、groups、roles、memberships、role_bindings、sessions、tokens |
| 来源       | sources、bindings、git_credentials                                 |
| 内容       | assets、versions、intakes、scans                                   |
| 发布       | requests、releases、scenarios、recommendations、asset_feedback     |
| 运行与证据 | jobs、audit、idempotency、login_attempts、cli_logins               |

SQLite 与 PostgreSQL 各以完整 Drizzle Schema 生成迁移，当前各有一条 `migrations/0000_init.sql` 初始迁移，包含表、唯一约束、关联守卫、不可变触发器及目录修订。启动时在互斥事务中执行官方 migrator，应用待执行变更；迁移历史必须与文件摘要一致，不转换未纳入当前迁移体系的旧数据库。详见[数据库迁移](../development/database-migrations.md)。SQLite 不可变 JSON 比较使用结构路径和值；PostgreSQL 使用 JSONB，均不依赖对象属性顺序。

事务作用域通过异步上下文传递，嵌套事务共享成败状态。内部失败即使被调用方捕获也不能部分提交；未等待的写入或回调结束后的迟到任务被拒绝。连接内操作顺序执行，同文件多 SQLite 连接和跨 PostgreSQL 连接仍受数据库边界约束。

反馈表以提交用户和请求键建立唯一约束，绑定资产与版本；创建、频率核验、修订更新和审计在同一事务内完成。反馈随当前结构快照备份和恢复，不转换旧格式。

## 内容存储

BlobStorage 使用 SHA-256 十六进制地址，读取复算摘要。文件系统通过临时文件和硬链接原子安装，不覆盖已存在对象，拒绝链接或特殊文件。MinIO 使用私有桶和条件 PUT，发生同名竞争后读取验证；不静默修复损坏对象。

BlobMaintenance 的枚举和删除能力仅用于明确的维护工具。回收必须停止 API 和 Worker，并保留所有 intake 原始包以及版本内容引用。

## 幂等和租约

幂等记录绑定用户、操作名和请求摘要，在同一事务内保存响应与业务写入。同键不同请求拒绝复用。

job.kind 与 input 为判别联合，intake/rescan/source_sync/ai_execution 各有准确输入。作业领取递增 lease_epoch；续租和最终写回核对拥有者、代次、截止时间及取消状态。过期执行者不能复活租约或覆盖接替者结果。

Worker 保持单实例，内容 tick 单飞；内容任务和 AI 执行各一个槽，由同一调度器认领与续租。AI 的恢复、中断和预算规则见 [AI 框架](ai-framework.md)。queued/running 可请求取消，取消完成后 unfinished intake 一并终止。来源自动轮询约五分钟一次，单来源已有排队或运行批次时复用。只复用固定提交、配置及当前扫描规则均一致的确定接收证据；临时失败由下一次同步重新处理。同步批次完成不表示每个目标均扫描通过，需查看 targets 的各目标结果。

未知扫描或存储故障按服务端可重试错误处理，不改判为用户内容格式错误。重试进入等待状态，来源配置失效使作业与接收一并取消，终态记录完成时间。

关闭先停止轮询并等待当前处理和清理，再关闭两类存储。装配失败会关闭已打开的存储。关闭幂等，Worker 或任一存储关闭失败仍尝试其余清理，并保留全部错误。

## 快照恢复

记录快照在一个事务中读取，内容块不可变，可随后复制。备份记录包括原始 intake 包、不可变版本、运行记录、封禁/撤销状态及审计。记录文件和每个内容块都有摘要校验。

恢复只写入空的当前结构数据库，校验重复 ID 和引用内容后按关联顺序在事务中写入。跨后端重放同一结构属于恢复操作。恢复 Git 凭据和 MCP 共享密钥均须使用原实例密钥。
