# 配置参考

配置入口为 apps/server/src/config/server-config.ts，模板为 .env.example。完整校验成功后才创建数据目录及本地密钥。pnpm dev/start 和根运维命令读取 .env；容器使用注入的环境变量。

| 变量                                          | 默认值或要求                                                         |
| --------------------------------------------- | -------------------------------------------------------------------- |
| NODE_ENV                                      | production 启用生产约束                                              |
| CAPABILITY_HUB_HOST / PORT                    | 127.0.0.1 / 4100；开发仅允许 loopback，端口 1–65535                  |
| CAPABILITY_HUB_PUBLIC_URL                     | http://127.0.0.1:4100；根 HTTP(S) 地址，无凭据/路径/查询，生产 HTTPS |
| CAPABILITY_HUB_DATA_DIR                       | 仓库 .data；部署包相对服务目录                                       |
| CAPABILITY_HUB_WEB_DIR                        | 仓库 apps/web/dist；部署包 web                                       |
| CAPABILITY_HUB_INSTANCE_SECRET                | 64 位十六进制；生产必须明确设置，开发可生成私有 instance.key         |
| CAPABILITY_HUB_SETUP_TOKEN                    | 生产首次初始化需要，未配置不能初始化                                 |
| CAPABILITY_HUB_WORKER                         | true；false 关闭内嵌 Worker                                          |
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

Compose 专用变量包括 CAPABILITY_HUB_IMAGE、POSTGRES_IMAGE、MINIO_IMAGE、POSTGRES_PASSWORD、MINIO_ROOT_USER、MINIO_ROOT_PASSWORD 及发布端口。它们不进入浏览器产物。测试变量 CAPABILITY_HUB_TEST_* 仅由隔离测试 runner 生成。

## AI 配置

`CAPABILITY_HUB_AI_CONFIG` 指向 UTF-8 JSON 文件，相对路径基于工作区根目录；未设置时模型列表为空，AI 工作台不能发起执行。复制仓库根目录的 [ai.config.example.json](../../ai.config.example.json) 到 `.data/ai-config.json`，按实际服务调整 API 前缀、model 和 `credential_ref`，再配置：

```dotenv
CAPABILITY_HUB_AI_CONFIG=.data/ai-config.json
HUB_AI_PRIMARY_KEY=<实际凭据>
```

JSON 中仅保存环境变量名，不直接保存 key。`format` 选择接口协议，`credential_ref` 独立指定供应商或账号的密钥变量，两者没有固定对应关系。示例中的两种协议使用同一供应商账号，因此都引用 `HUB_AI_PRIMARY_KEY`；使用不同供应商或账号时，分别指定各自的变量名即可。也可以只保留一个模型配置；`default_profile` 必须存在。支持字段、默认预算和 MCP 白名单见 [AI 框架](../design/ai-framework.md)。修改后重启服务；现有执行绑定原模型配置摘要，不能静默改用另一个模型恢复。

容器需要以只读方式挂载配置文件，并设置容器内的绝对路径及 `credential_ref` 对应环境变量。默认 Compose 未自动传递 AI 凭据，部署者需显式配置环境变量或秘密注入。凭据不得进入 Web 构建。
