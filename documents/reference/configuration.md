# 配置参考

配置入口为 apps/server/src/config/server-config.ts，模板为 .env.example。完整校验成功后才创建数据目录及本地密钥。pnpm dev/start 和根运维命令读取 .env；容器使用注入的环境变量。

| 变量                                          | 默认值或要求                                                         |
| --------------------------------------------- | -------------------------------------------------------------------- |
| NODE_ENV                                      | production 启用生产约束                                              |
| CAPABILITY_HUB_HOST / PORT                    | 127.0.0.1 / 4100；开发仅允许 loopback，端口 1–65535                  |
| CAPABILITY_HUB_PUBLIC_URL                     | http://127.0.0.1:4100；生产必填 HTTP(S) 根地址，不含凭据、路径或查询 |
| CAPABILITY_HUB_TRUSTED_PROXY_ADDRESSES        | 默认不信任转发头；代理 IPv4/IPv6 单地址以逗号分隔，不接受网段或跳数  |
| CAPABILITY_HUB_CLI_REGISTRY                   | 空时直接 npm 安装；HTTP(S) 仓库可含路径，不含凭据、查询或片段        |
| CAPABILITY_HUB_DATA_DIR                       | 源码默认 .data；Compose 将指定的宿主机目录挂载到 /app/data           |
| CAPABILITY_HUB_WEB_DIR                        | 仓库 apps/web/dist；部署包 web                                       |
| CAPABILITY_HUB_INSTANCE_SECRET                | 64 位十六进制；生产必须明确设置，开发可生成私有 instance.key         |
| CAPABILITY_HUB_SETUP_TOKEN                    | 生产首次初始化需要，未配置不能初始化                                 |
| CAPABILITY_HUB_WORKER                         | true；false 关闭内嵌 Worker                                          |
| CAPABILITY_HUB_WORKER_CONCURRENCY             | 默认 5，可设 1–100 的整数。所有 Worker 作业共用此上限                |
| CAPABILITY_HUB_EVALUATION_CONCURRENCY         | 默认 1，整数范围为 1 到 max(1, Worker 并发 − 1)                      |
| CAPABILITY_HUB_EVALUATION_DAILY_REQUESTS      | 默认 0，仅做结构检查。启用模型评测须显式设置 UTC 每日调用上限        |
| CAPABILITY_HUB_EVALUATION_BACKFILL            | 默认 false，按近 30 天使用次数回填当前 Skill 发布                    |
| CAPABILITY_HUB_GIT_HOSTS                      | github.com,gitlab.com，规范域名/IP 列表                              |
| CAPABILITY_HUB_PRIVATE_GIT_HOSTS              | 空；必须为 Git 允许列表子集                                          |
| CAPABILITY_HUB_LOG_LEVEL                      | info，允许 trace/debug/info/warn/error/fatal/silent                  |
| CAPABILITY_HUB_REQUEST_LOGS                   | true；false 关闭请求完成日志                                         |
| CAPABILITY_HUB_DATABASE_DRIVER                | sqlite 或 postgresql，默认 sqlite                                    |
| CAPABILITY_HUB_DATABASE_URL                   | PostgreSQL 模式必须提供合法 postgres(ql) URL                         |
| CAPABILITY_HUB_DATABASE_POOL_SIZE             | 10，1–100                                                            |
| CAPABILITY_HUB_OBJECT_STORAGE_DRIVER          | filesystem 或 minio，默认 filesystem                                 |
| CAPABILITY_HUB_MINIO_ENDPOINT                 | MinIO 模式必需，HTTP(S) 根地址                                       |
| CAPABILITY_HUB_MINIO_ACCESS_KEY / SECRET_KEY  | 非空应用身份，不使用管理身份                                         |
| CAPABILITY_HUB_MINIO_BUCKET / REGION / PREFIX | capability-hub / us-east-1 / blobs/；桶必须预先存在且私有            |

全新完整评测在已配置默认模型且当前 UTC 窗口至少剩余 33 次调用额度时启动。提供方会收到候选或受限 Skill 的内容，以及同一受众等级可读的干扰项名称与描述，须获准处理这些数据。

布尔开关在环境变量中使用小写字符串 true/false，加载后转换为 boolean；未设置时使用默认值，空字符串、0/1 或其他值均报错。未知驱动或不合法配置立即失败。相对实例路径以工作区/部署包解析，不随进程工作目录变化。

Compose 宿主监听地址和端口默认取 `CAPABILITY_HUB_HOST` 和 `PORT`，可用 `CAPABILITY_HUB_BIND_HOST`、`CAPABILITY_HUB_PORT` 覆盖。若需按代理后的来源限流，只登记能重写转发头或追加真实来源地址的受信代理。部署见[容器部署](../operations/deployment.md#compose)。

## LDAP 登录

- `CAPABILITY_HUB_LDAP_URL` 为空时禁用目录登录。默认仅开发回环地址允许 `ldap://`，远程或生产连接需使用 `ldaps://` 并校验证书；确需明文时显式设置 `CAPABILITY_HUB_LDAP_ALLOW_INSECURE=true`，账号密码将在网络中明文传输。私有 CA 通过 `NODE_EXTRA_CA_CERTS` 加载。
- `CAPABILITY_HUB_LDAP_DIRECTORY_TYPE` 默认 `ldap`，读取 `uid`、`cn`、`entryUUID`；微软 AD 设置为 `ad`，读取 `sAMAccountName`、`displayName`（缺失时用 `cn`）、二进制 `objectGUID`。登录页填写短账号名，不含域名。
- `CAPABILITY_HUB_LDAP_BASE_DN` 限定用户及部门搜索范围。`CAPABILITY_HUB_LDAP_BIND_DN` 和 `CAPABILITY_HUB_LDAP_BIND_PASSWORD` 提供查询身份，AD 可填写 `账号@域名`；须能读取用户属性，以及 OU 的 `description`、`ou` 和唯一标识。登录名在子树内须唯一，用户绑定后须能按唯一标识读取本条目。
- 每次成功登录按最近一层 OU 的 `entryUUID` / `objectGUID` 同步共享部门团队，名称优先取 `description`，否则取 `ou`，重名时附加目录标识；不越过搜索范围，也不全量导入部门。同步只调整目录部门归属，手工团队、已有个人团队及资源保留。目录部门名称和成员只读，团队启停仍由 Hub 管理。
- `CAPABILITY_HUB_LDAP_DEFAULT_ROLES` 默认 `maintainer,reader`，只在首次建号时授予。`maintainer` 限于部门，缺少 OU 不授予；其他角色按平台范围授予。Hub 停用部门即暂停其自动维护权，调动仅迁移仍存在的自动授权；手工授权不变，已撤销的不补发。

## AI 配置

`CAPABILITY_HUB_AI_CONFIG` 指向 UTF-8 JSON 文件，相对路径基于工作区根目录。未设置时模型列表为空，无法发起 AI 任务。复制仓库根目录的 [ai.config.example.json](../../ai.config.example.json) 到 `.data/ai-config.json`，按实际服务调整 API 前缀、model 和 `credential_ref`。

```dotenv
CAPABILITY_HUB_AI_CONFIG=.data/ai-config.json
HUB_AI_PRIMARY_KEY=<实际凭据>
```

`format` 选协议，`credential_ref` 引用密钥环境变量，`default_profile` 引用已有模型配置 ID。重启后生效，旧执行仍校验原模型摘要。预算和 MCP 白名单见 [AI 框架](../design/ai-framework.md)。

配置 `default_profile` 即启用首页对话，无需额外 AI 角色；未配置时仅匹配关键词。模型出站请求限 32 KiB、响应限 512 KiB。开场提示生成和预检使用档案的 `max_output_tokens`（含推理）和 `request_timeout_ms`；前台提问另限 4096 token、60 秒。

启用 Worker 后按 UTC 六小时窗口刷新：同受众每批至多 12 项，每窗最多 4 批、`min(20, max_requests)` 次出站，共用 `active_timeout_ms` 与 `execution_timeout_ms` 中较短的时限，不跨窗。成功批次可复用，后续失败不撤回。生成发送类型、简介、标签和场景；预检发送候选问题及本批卡片。前台每轮最多一次出站，每分钟每主体 8 次、每进程 30 次，最多 3 个在途；发送问题、对话条件与可见卡片（引用号、slug、类型、分类、场景、标签及简介开头）。提供方须获准处理这些数据，包括受限发布。

两种协议均支持 `request_headers`。值可为非敏感的单行 ASCII 字符串，或 `{"from":"execution_id","prefix":"ses_"}`（前缀可省略，续跑保留同一执行 ID）。头名不区分大小写，不可重复或覆盖鉴权、Host、报文传输等保留头。[OpenCode Go](https://opencode.ai/docs/console/go/#where-can-i-use-it) 用固定 `User-Agent: capability-hub` 和动态 `x-opencode-session`。

Chat Completions 缺省发送 `max_tokens`。端点要求 `max_completion_tokens` 时，将 `chat_max_tokens_field` 设为该字段名；数值仍是本次调用的实际输出限额。

`thinking_control` 默认 `protocol`，OpenAI 发送 `reasoning_effort=none`，Anthropic 发送 `thinking.type=disabled`。Chat 端点可用 `thinking_type` 发送 `thinking.type=disabled`，或用 `enable_thinking` 发送 `enable_thinking=false`。`omit` 不发思考参数，沿用端点默认值。

必须思考的模型选 `effort_only`，仅发送强度。默认 `reasoning_effort` 为 `medium`，可选端点支持的 `low`、`medium`、`high`、`xhigh`、`max`。用 `"reasoning_effort_overrides": {"resource-audit/assessment": "low"}` 按 `操作 ID/调用的 Agent ID` 覆盖，格式修复沿用原调用档位。

Compose 传入 `CAPABILITY_HUB_AI_CONFIG` 和示例使用的 `HUB_AI_PRIMARY_KEY`。模型配置可单独只读挂载，也可放入宿主数据目录并使用容器路径 `/app/data/ai-config.json`。其他 `credential_ref` 需显式注入对应环境变量，凭据不得进入 Web 构建。
