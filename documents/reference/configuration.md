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
| CAPABILITY_HUB_WORKER                         | 1；0 关闭内嵌 Worker                                                 |
| CAPABILITY_HUB_GIT_HOSTS                      | github.com,gitlab.com，规范域名/IP 列表                              |
| CAPABILITY_HUB_PRIVATE_GIT_HOSTS              | 空；必须为 Git 允许列表子集                                          |
| CAPABILITY_HUB_LOG_LEVEL                      | info，允许 trace/debug/info/warn/error/fatal/silent                  |
| CAPABILITY_HUB_REQUEST_LOGS                   | 1；0 关闭请求完成日志                                                |
| CAPABILITY_HUB_DATABASE_DRIVER                | sqlite 或 postgresql，默认 sqlite                                    |
| CAPABILITY_HUB_DATABASE_URL                   | PostgreSQL 模式必须提供合法 postgres(ql) URL                         |
| CAPABILITY_HUB_DATABASE_POOL_SIZE             | 10，1–100                                                            |
| CAPABILITY_HUB_OBJECT_STORAGE_DRIVER          | filesystem 或 minio，默认 filesystem                                 |
| CAPABILITY_HUB_MINIO_ENDPOINT                 | MinIO 模式必需，HTTP(S) 根地址                                       |
| CAPABILITY_HUB_MINIO_ACCESS_KEY / SECRET_KEY  | 非空应用身份，不使用管理身份                                         |
| CAPABILITY_HUB_MINIO_BUCKET / REGION / PREFIX | capability-hub / us-east-1 / blobs/；桶必须预先存在且私有            |

布尔值严格接受 0/1，未知驱动或不合法配置立即失败。相对实例路径以工作区/部署包解析，不随进程工作目录变化。

Compose 专用变量包括 CAPABILITY_HUB_IMAGE、POSTGRES_IMAGE、MINIO_IMAGE、POSTGRES_PASSWORD、MINIO_ROOT_USER、MINIO_ROOT_PASSWORD 及发布端口。它们不进入浏览器产物。测试变量 CAPABILITY_HUB_TEST_* 仅由隔离测试 runner 生成。
