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

server 默认发布到回环地址。内网 HTTP 直连可设置 `CAPABILITY_HUB_BIND_HOST`、`CAPABILITY_HUB_PORT` 和对应的公开地址。HTTPS 代理需转发公开 Host；如需按访客区分限流，设置 `CAPABILITY_HUB_TRUSTED_PROXY_ADDRESSES` 为 Hub 实际看到的受信代理地址，并由代理重写转发头或追加真实来源。Compose 中该地址可能是桥接网关，不能直接照填宿主回环地址或信任整个网段。容器根文件系统只读，按负载配置 Git 和扫描所需的 `/tmp`。

## 已有实例升级

- 从旧扫描规则升级到 `2026-11-23.1` 时，旧规则下待审的申请不能继续批准（`409 REVIEW_STALE`）。先重扫固定版本，再提交新申请；历史回退、通用提名也需要目标版本的当前规则扫描。已发布内容不重打包、不改写。
- 升级前确认至少一个启用账号是直接授予的平台管理员，或通过启用的本地团队获得该角色。若现有管理员全靠 LDAP 部门继承，升级后受保护的账号、团队或授权变更会返回 `409 LAST_ADMIN`。仍有管理权限的管理员可在「团队与权限」先向启用账号直接授予平台范围的内置 `admin` 角色，再重试原操作。

## 验收

- /health/live 表示进程存活，/health/ready 校验数据库和内容存储。
- 检查非 root 用户、编译入口、SQL/Schema/扫描资产及静态页面实际存在，并在运营中心 → 实例运行核对 Hub 版本与构建提交。
- 部署后切回旧业务页或发起请求，应提示立即刷新或 10 秒后刷新；关闭或换页即取消倒计时。载入新版后「Hub 已更新」可手动关闭或 10 秒后自动关闭（后台、悬停、聚焦暂停），同构建不再提示。登录和初始化页无横幅，仅在有新版时提供「登录遇到问题？」→「刷新页面」。
- 初始化账号，走上传、扫描、独立审核、权限收窄和公开访问链路。
- 使用真实目标 Agent 客户端核验 MCP 协议、变量和配置，不把生成文本视为已连接成功。
- npm 仓库需发布即见时，对包元数据（packument）返回 `Cache-Control: no-cache`，保留有效的 `Last-Modified` 或 `ETag`，检查代理的元数据有效期和 404 负缓存，无需调整归档缓存。策略生效后先缓存旧版，再发布新版，分别用空缓存和已有缓存执行不带 `--prefer-online` 的 `npm i -g @capability-hub/cli@latest`，核对安装版本。

运维脚本在镜像内为 `node scripts/backup.js`、`restore-import.js`、`restore-check.js`、`maintenance.js` 、`recover-account.js` 和 `migrate.js`。对现有实例操作前明确数据卷与配置；服务启动与迁移命令均会应用当前迁移历史中的待执行变更，不转换未纳入当前迁移体系的旧数据库。部署前审查 SQL 并备份，详见[数据库迁移](../development/database-migrations.md)。
