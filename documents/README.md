# 工程文档

文档描述当前实现，源码与锁文件是行为和依赖版本的最终依据。

| 主题       | 文档                                                                                                                                                                                                                   |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 启动与使用 | [本地开发](getting-started/local-development.md) · [资源使用与发布](getting-started/workflows.md)                                                                                                                      |
| 架构       | [系统架构](architecture/system.md) · [模块职责](architecture/modules.md)                                                                                                                                               |
| 详细设计   | [接收、发布与分发](design/content-lifecycle.md) · [身份与安全](design/identity-security.md) · [持久化与任务](design/persistence-jobs.md) · [AI 框架](design/ai-framework.md) · [业务 Agent](design/business-agents.md) |
| 开发       | [工程规范](development/engineering.md) · [脚本分类](development/scripts.md) · [测试策略](development/testing.md) · [数据库迁移](development/database-migrations.md)                                                    |
| 运维       | [容器部署](operations/deployment.md) · [备份、恢复与维护](operations/recovery.md)                                                                                                                                      |
| 参考       | [配置](reference/configuration.md) · [HTTP、MCP 与 CLI](reference/interfaces.md) · [Agent 客户端接入](reference/agent-clients.md) · [AI 接口](reference/ai-interfaces.md)                                              |

文档中的命令从仓库根目录执行，容器内命令会显式注明。环境中的真实客户端连接、网络策略和部署行为需由部署方分别验收。
