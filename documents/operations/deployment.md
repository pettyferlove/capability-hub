# 容器部署

## 产物和前置条件

```sh
docker build -t YOUR_REGISTRY/capability-hub:VERSION .
pnpm test:image YOUR_REGISTRY/capability-hub:VERSION
```

多阶段构建使用锁定的 Node/pnpm，编译各 workspace 和运维脚本，最终镜像由 node 用户运行已编译的 JavaScript。运行资产包括两方言完整迁移目录（SQL、快照与 journal）、扫描子进程、官方 MCP Schema 和 Web dist。

部署方配置客户端可达的 HTTP 或 HTTPS 根地址、出站网络及持久卷。生产需要 64 位十六进制实例密钥和首次初始化令牌，由部署秘密存储注入。

## Compose

参考 compose.yaml 和 .env.example，明确设置应用及依赖镜像、数据库密码、MinIO 管理账号与独立应用账号。生产镜像应选部署方审核过的版本或摘要。Compose 不自动创建应用桶和权限。

```sh
docker compose up -d postgres minio
docker compose --profile bootstrap run --rm minio-bootstrap
docker compose up -d server
```

bootstrap 是一次性配置：创建私有桶、独立应用账号及 blobs/* 读取/写入策略，遇到已有账号或策略会拒绝覆盖。日常运维不重复运行它。正常 API 无删除对象权限；离线回收需要单独授权的维护账号。

server 默认发布到回环地址。内网 HTTP 直连可设 `CAPABILITY_HUB_BIND_HOST=192.168.1.20`、`CAPABILITY_HUB_PORT=4100` 和 `CAPABILITY_HUB_PUBLIC_URL=http://192.168.1.20:4100`，将示例 IP 换成服务器内网地址。选择 HTTPS 时由反向代理终止 TLS，并转发公开地址的 Host。容器根文件系统只读，Git 和扫描作业所需的 /tmp 容量按实际负载配置。

## 验收

- /health/live 表示进程存活，/health/ready 校验数据库和内容存储。
- 检查非 root 用户、编译入口、SQL/Schema/扫描资产及静态页面实际存在。
- 初始化账号，走上传、扫描、独立审核、权限收窄和公开访问链路。
- 使用真实目标 Agent 客户端核验 MCP 协议、变量和配置，不把生成文本视为已连接成功。

运维脚本在镜像内为 `node scripts/backup.js`、`restore-import.js`、`restore-check.js`、`maintenance.js` 、`recover-account.js` 和 `migrate.js`。对现有实例操作前明确数据卷与配置；服务启动与迁移命令均会应用当前迁移历史中的待执行变更，不转换未纳入当前迁移体系的旧数据库。部署前审查 SQL 并备份，详见[数据库迁移](../development/database-migrations.md)。
