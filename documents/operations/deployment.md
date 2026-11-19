# 容器部署

## 产物和前置条件

```sh
docker build -t YOUR_REGISTRY/capability-hub:VERSION .
pnpm test:image YOUR_REGISTRY/capability-hub:VERSION
```

多阶段构建使用锁定的 Node/pnpm，编译各 workspace 和运维脚本，最终镜像由 node 用户运行已编译的 JavaScript。运行资产包括两方言完整迁移目录（SQL、快照与 journal）、扫描子进程、官方 MCP Schema 和 Web dist。可用 `--build-arg CAPABILITY_HUB_BUILD_COMMIT=<提交>` 记录构建来源；提高 CLI 推荐版本前先发布对应 CLI。

部署方配置客户端可达的 HTTP 或 HTTPS 根地址、出站网络及持久卷。生产需要 64 位十六进制实例密钥和首次初始化令牌，由部署秘密存储注入。

## Compose

在部署用的 `.env` 中填写应用镜像、公开地址、实例密钥和初始化令牌。默认使用 SQLite 和文件存储，只启动 Hub。

```sh
docker compose --env-file .env up -d server
```

`CAPABILITY_HUB_DATA_DIR` 选择宿主机目录。例如设为 `/srv/capability-hub/data`，启动前执行 `install -d -m 0700 -o 1000 -g 1000 /srv/capability-hub/data`。它挂载到容器的 `/app/data`，保存 SQLite 的 `hub.sqlite` 和文件存储的 `blobs/`。PostgreSQL 和 MinIO 将数据写到各自的存储。留空时复用 `server-data` 命名卷；已有实例应保留原驱动，若之前用的是该卷，应去掉旧模板中未生效的 `CAPABILITY_HUB_DATA_DIR=.data`。改变路径或驱动不会迁移数据。

数据库和对象存储独立选择。使用已有 PostgreSQL 时设 `CAPABILITY_HUB_DATABASE_DRIVER=postgresql` 和 `CAPABILITY_HUB_DATABASE_URL`。使用已有 MinIO 时设 `CAPABILITY_HUB_OBJECT_STORAGE_DRIVER=minio`、容器可达的 `CAPABILITY_HUB_MINIO_ENDPOINT`、私有桶及应用凭据。

需要 Compose 托管依赖时，另设 `COMPOSE_PROFILES=postgres`、`minio` 或 `postgres,minio`，并选择相应驱动。内置 PostgreSQL 使用 `CAPABILITY_HUB_POSTGRES_PASSWORD`，内置 MinIO 使用指定镜像和独立管理账号。首次使用内置 MinIO 时先运行 `docker compose --env-file .env --profile bootstrap run --rm minio-bootstrap` 创建私有桶及应用权限，再启动 Hub。已有账号或策略不会被覆盖。

server 默认发布到回环地址。内网 HTTP 直连可设 `CAPABILITY_HUB_BIND_HOST=192.168.1.20`、`CAPABILITY_HUB_PORT=4100` 和 `CAPABILITY_HUB_PUBLIC_URL=http://192.168.1.20:4100`，将示例 IP 换成服务器内网地址。选择 HTTPS 时由反向代理终止 TLS，并转发公开地址的 Host。容器根文件系统只读，Git 和扫描作业所需的 /tmp 容量按实际负载配置。

## 验收

- /health/live 表示进程存活，/health/ready 校验数据库和内容存储。
- 检查非 root 用户、编译入口、SQL/Schema/扫描资产及静态页面实际存在，并在运营中心 → 实例运行核对 Hub 版本与构建提交。
- 部署前先打开网页。部署后切回旧标签页或发起请求，应提示刷新；可立即刷新或启动 10 秒倒计时，关闭提示或切换页面会取消倒计时。用同一浏览器重新打开，应看到「Hub 已更新」，10 秒后自动关闭（后台、悬停或聚焦时暂停），也可点「知道了」；关闭后同构建不再提示。
- 初始化账号，走上传、扫描、独立审核、权限收窄和公开访问链路。
- 使用真实目标 Agent 客户端核验 MCP 协议、变量和配置，不把生成文本视为已连接成功。
- npm 仓库需发布即见时，对包元数据（packument）返回 `Cache-Control: no-cache`，保留有效的 `Last-Modified` 或 `ETag`，检查代理的元数据有效期和 404 负缓存，无需调整归档缓存。策略生效后先缓存旧版，再发布新版，分别用空缓存和已有缓存执行不带 `--prefer-online` 的 `npm i -g @capability-hub/cli@latest`，核对安装版本。

运维脚本在镜像内为 `node scripts/backup.js`、`restore-import.js`、`restore-check.js`、`maintenance.js` 、`recover-account.js` 和 `migrate.js`。对现有实例操作前明确数据卷与配置；服务启动与迁移命令均会应用当前迁移历史中的待执行变更，不转换未纳入当前迁移体系的旧数据库。部署前审查 SQL 并备份，详见[数据库迁移](../development/database-migrations.md)。
