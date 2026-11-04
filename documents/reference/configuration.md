# 配置参考

配置入口为 apps/server/src/config/server-config.ts，模板为 .env.example。完整校验成功后才创建数据目录及本地密钥。pnpm dev/start 和根运维命令读取 .env；容器使用注入的环境变量。

| 变量                                          | 默认值或要求                                                         |
| --------------------------------------------- | -------------------------------------------------------------------- |
| NODE_ENV                                      | production 启用生产约束                                              |
| CAPABILITY_HUB_HOST / PORT                    | 127.0.0.1 / 4100；开发仅允许 loopback，端口 1–65535                  |
| CAPABILITY_HUB_PUBLIC_URL                     | http://127.0.0.1:4100；生产必填 HTTP(S) 根地址，不含凭据、路径或查询 |
| CAPABILITY_HUB_CLI_REGISTRY                   | 空时直接 npm 安装；HTTP(S) 仓库可含路径，不含凭据、查询或片段        |
| CAPABILITY_HUB_DATA_DIR                       | 源码默认 .data；Compose 将指定的宿主机目录挂载到 /app/data           |
| CAPABILITY_HUB_WEB_DIR                        | 仓库 apps/web/dist；部署包 web                                       |
| CAPABILITY_HUB_INSTANCE_SECRET                | 64 位十六进制；生产必须明确设置，开发可生成私有 instance.key         |
| CAPABILITY_HUB_SETUP_TOKEN                    | 生产首次初始化需要，未配置不能初始化                                 |
| CAPABILITY_HUB_WORKER                         | true；false 关闭内嵌 Worker                                          |
| CAPABILITY_HUB_WORKER_CONCURRENCY             | 默认 5，可设 1–5 的整数。AI、接收、重扫和 Git 同步共用此上限         |
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

布尔开关在环境变量中使用小写字符串 true/false，加载后转换为 boolean；未设置时使用默认值，空字符串、0/1 或其他值均报错。未知驱动或不合法配置立即失败。相对实例路径以工作区/部署包解析，不随进程工作目录变化。

Compose 的宿主机监听地址和端口默认取 `CAPABILITY_HUB_HOST` 和 `PORT`，可用 `CAPABILITY_HUB_BIND_HOST` 和 `CAPABILITY_HUB_PORT` 分别覆盖。容器内监听 `0.0.0.0` 和 `PORT`。[容器部署](../operations/deployment.md#compose) 说明存储驱动与可选服务的组合。

## LDAP 登录

- `CAPABILITY_HUB_LDAP_URL` 为空时仅启用本地登录。正式目录使用 `ldaps://` 并校验证书，私有 CA 可通过 Node 的 `NODE_EXTRA_CA_CERTS` 加载。开发模式允许连接本机回环地址的 `ldap://` 服务。
- `CAPABILITY_HUB_LDAP_BASE_DN` 限定用户搜索子树。`CAPABILITY_HUB_LDAP_BIND_DN` 和 `CAPABILITY_HUB_LDAP_BIND_PASSWORD` 提供只读查询身份，需能读取 `uid`、`cn` 和 `entryUUID`。同一搜索子树内的 `uid` 须唯一，用户绑定后须能按自己的 `entryUUID` 查询本条目。
- `CAPABILITY_HUB_LDAP_DEFAULT_ROLES` 接受逗号分隔的内置角色键，默认 `maintainer,reader`。仅需使用者时填 `reader`。维护者绑定到首次登录时新建的个人维护团队。其余角色按平台范围授予，包括显式配置的 `reviewer` 或 `admin`。配置在重启后生效，仅影响之后首次建号的用户。

## AI 配置

`CAPABILITY_HUB_AI_CONFIG` 指向 UTF-8 JSON 文件，相对路径基于工作区根目录。未设置时模型列表为空，无法发起 AI 任务。复制仓库根目录的 [ai.config.example.json](../../ai.config.example.json) 到 `.data/ai-config.json`，按实际服务调整 API 前缀、model 和 `credential_ref`。

```dotenv
CAPABILITY_HUB_AI_CONFIG=.data/ai-config.json
HUB_AI_PRIMARY_KEY=<实际凭据>
```

`format` 选择协议，`credential_ref` 只填写密钥的环境变量名。`default_profile` 必须指向已有模型配置。修改后重启服务，新执行使用新配置，已有执行按原模型配置摘要校验。预算和 MCP 白名单见 [AI 框架](../design/ai-framework.md)。

所有 Agent 在模型配置的 `thinking_control` 下运行。默认 `protocol` 请求关闭思考，OpenAI 发送 `reasoning_effort=none`，Anthropic 发送 `thinking.type=disabled`。OpenAI 兼容端点若要求 `thinking.type=disabled`，选 `thinking_type`。不接受思考参数的端点选 `omit`。

必须思考的模型选 `effort_only`，仅发送强度。默认 `reasoning_effort` 为 `medium`，可选端点支持的 `low`、`medium`、`high`、`xhigh`、`max`。用 `"reasoning_effort_overrides": {"resource-audit/assessment": "low"}` 按 `操作 ID/调用的 Agent ID` 覆盖，格式修复沿用原调用档位。

Compose 传入 `CAPABILITY_HUB_AI_CONFIG` 和示例使用的 `HUB_AI_PRIMARY_KEY`。模型配置可单独只读挂载，也可放入宿主数据目录并使用容器路径 `/app/data/ai-config.json`。其他 `credential_ref` 需显式注入对应环境变量，凭据不得进入 Web 构建。
