# 模块职责

## 应用层

| 目录        | 主要职责与边界                                                          |
| ----------- | ----------------------------------------------------------------------- |
| identity    | 当前身份解析、认证、账号与授权管理、会话、令牌和 CLI 一次性授权分别实现 |
| profile     | 个人资料、安全记录和个人活动投影                                        |
| credentials | Git 凭据所属权、匹配、轮换和撤销；加密与 SSH 检查使用端口               |
| sources     | 来源配置与绑定管理、固定提交同步分别实现                                |
| catalog     | 可分发目录、候选/历史访问、内容交付、管理查询、推荐及生命周期           |
| intake      | 接收命令、状态查询、扫描及版本提交处理器                                |
| publication | 冻结申请、独立决定、提名、撤回与审查查询                                |
| jobs        | 排队、租约、续租、取消和受租约约束的写回                                |
| audit       | 安全展示快照、审计检索与结果投影                                        |
| shared      | 有明确复用者的上下文、幂等与修订约束                                    |
| ports       | RecordStore、BlobStorage、GitRepository、密码/密钥/游标和扫描能力       |

应用命令表示用例需要的字段，不包含 HTTP Request、Response 或 ServerConfig。HubServices 只装配实例；没有应用用例反向访问 HubServices。

## 基础设施

- persistence/sqlite、persistence/postgresql：分别保存 driver、record-queries、record-schema、完整 schema、initialize 和 Drizzle migrations；原生触发器随迁移 SQL 发布。
- persistence/transaction：顺序执行与事务作用域；backup：当前结构快照和恢复校验。
- content：规范内容检查、ZIP、有限 JSON、文件系统与 MinIO 存储。
- git：URL/网络策略、固定提交读取和命令执行。
- security：scrypt、AES-GCM 凭据、OpenSSH 公钥检查和签名游标。
- scanning：隔离进程入口及消息格式。

## 入口与 Web

server 的 http/routes 只做协议解析、身份/CSRF 接入和结果交付；业务写入通过用例。integrations 保存 MCP 工具及目标客户端配置转换，observability 保存运行指标。

Web 的 app 管理会话、路由、主题和导航。features 按 auth、catalog、connect、identity、profile、publishing、review、sources 组织。shared 只放跨功能 API、控件、格式、上下文和导航能力。来源编辑表单与来源列表独立，发布策略字段归发布功能。

Web 统一使用 Tailwind CSS v4。styles/index.css 加载主题、基础元素规则与关键帧；功能目录的 styles.ts 和 shared/styles 保存静态工具类组合，组件通过 cn 合并条件和覆盖。主题、变体与验证规范见[工程规范](../development/engineering.md#tailwind-样式)。

CLI 按 cli、api-client、response-schemas、credentials、filesystem、install 分工。命令不执行下载的 Skill 或目标 MCP。
