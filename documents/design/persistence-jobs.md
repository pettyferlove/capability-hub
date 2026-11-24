# 持久化与任务设计

## RecordStore

应用层定义异步 RecordStore；Drizzle 实现在 infrastructure。记录以类型化模型读写，写入前、读取数据库 JSON 时以及导入外部快照时，均按当前每表结构校验；校验失败同样使所属事务整体回滚。连接、ORM schema、查询和事务不暴露给用例。

| 分组       | 记录                                                                  |
| ---------- | --------------------------------------------------------------------- |
| 身份       | users、groups、roles、memberships、role_bindings、sessions、tokens    |
| 来源       | sources、bindings、git_credentials                                    |
| 内容       | assets、versions、intakes、scans                                      |
| 发布       | requests、releases、scenarios、recommendations、asset_feedback        |
| 平台反馈   | hub_feedback、hub_feedback_events、hub_feedback_attachments           |
| 运行与证据 | jobs、audit、idempotency、login_attempts、cli_logins、install_tickets |
| 质量评测   | resource_evaluations（终态只读）、evaluation_schedule（单例）         |
| 发现提示   | catalog_prompts（单例，生成列只供调度读取）                           |

SQLite 与 PostgreSQL 各以完整 Drizzle Schema 生成迁移：`migrations/0000_init.sql` 初始化表、唯一约束、关联守卫、不可变触发器及目录修订，后续结构变更按迁移历史追加。启动时在互斥事务中执行官方 migrator，应用待执行变更；迁移历史必须与文件摘要一致，不转换未纳入当前迁移体系的旧数据库。详见[数据库迁移](../development/database-migrations.md)。SQLite 不可变 JSON 比较使用结构路径和值；PostgreSQL 使用 JSONB，均不依赖对象属性顺序。

事务作用域通过异步上下文传递，嵌套事务共享成败状态。内部失败即使被调用方捕获也不能部分提交；未等待的写入或回调结束后的迟到任务被拒绝。连接内操作顺序执行，同文件多 SQLite 连接和跨 PostgreSQL 连接仍受数据库边界约束。

资源反馈绑定资产与版本。平台反馈附件先检查权限、幂等、修订和额度，事务外写对象，提交时复核再建立引用。并发变更导致复核失败时不发布附件，也不删除可能共享的对象；无引用对象由[停机维护](../operations/recovery.md#维护与账号恢复)回收。移除附件保留元数据与审计。

## 内容存储

BlobStorage 使用 SHA-256 十六进制地址，读取复算摘要。文件系统通过临时文件和硬链接原子安装，不覆盖已存在对象，拒绝链接或特殊文件。MinIO 使用私有桶和条件 PUT，发生同名竞争后读取验证；不静默修复损坏对象。

BlobMaintenance 仅供停机回收，保留原始包、版本和未移除附件引用；具体保留期见[运维维护](../operations/recovery.md#维护与账号恢复)。

## 幂等和租约

幂等记录绑定用户、操作名和请求摘要，在同一事务内保存响应与业务写入。同键不同请求拒绝复用。

作业类型包括 intake、rescan、source_sync、ai_execution、catalog_prompt_refresh 和 resource_evaluation。每个评测作业执行一个结构或模型阶段，阶段结果与作业终态在同一租约事务提交。领取作业递增 lease_epoch，续租和最终写回核对拥有者、代次、截止时间及取消状态。过期执行者不能覆盖接替者结果。

提示刷新在写事务中确认到期且没有活动作业才入队，记录窗口与 `active_job_id`。每次生成或预检前用 `withLease` 复核租约、窗口、模型摘要和整批来源，再预占额度。终态事务提交批次、游标、下次窗口与作业状态；失败保留有效旧批次，失去租约不结算。调度器可修正已终结作业的活动指针。窗口和出站限额见[配置参考](../reference/configuration.md#ai-配置)。

Worker 按 run_after 和事务内的有效租约领取作业。AI 与内容任务共用[并发上限](../reference/configuration.md)，同库 Worker 应使用相同配置。AI 恢复规则见 [AI 框架](ai-framework.md)。取消作业或接管中断的 Git 同步时，终止旧批次未完成的接收。来源约每五分钟轮询，同一来源、同一配置修订才复用在途批次。固定提交、配置及扫描规则一致时可复用确定的接收结果；凭据失效和临时失败由下次同步重读，逐目标结果见 targets。

未知扫描或存储故障按服务端可重试错误处理，不改判为用户内容格式错误。重试进入等待状态，来源配置失效使作业与接收一并取消，终态记录完成时间。

关闭先停止轮询并等待当前处理和清理，再关闭两类存储。装配失败会关闭已打开的存储。关闭幂等，Worker 或任一存储关闭失败仍尝试其余清理，并保留全部错误。

## 快照恢复

记录在同一事务读取，随后复制不可变内容对象（包括未移除的反馈附件）。记录文件和内容对象均校验摘要。

空库导入逐表校验记录与重复 ID，按关联顺序在事务中写入。表结构匹配时可跨后端恢复；Git 凭据与 MCP 共享密钥须使用原实例密钥。备份格式及旧版恢复路径见[恢复](../operations/recovery.md#恢复)。
