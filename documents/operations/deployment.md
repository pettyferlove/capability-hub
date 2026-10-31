# 容器部署

## 产物和前置条件

```sh
docker build -t YOUR_REGISTRY/capability-hub:VERSION .
pnpm test:image YOUR_REGISTRY/capability-hub:VERSION
```

多阶段构建使用锁定的 Node/pnpm，编译各 workspace 和运维脚本，最终镜像由 node 用户运行已编译的 JavaScript。运行资产包括两方言完整迁移目录（SQL、快照与 journal）、扫描子进程、官方 MCP Schema 和 Web dist。

部署方配置 HTTPS 反向代理、允许 Host、公网根 URL、出站网络及持久卷。生产需要 64 位十六进制实例密钥和首次初始化令牌；秘密从部署秘密存储注入，不写镜像或版本库。

## Compose

参考 compose.yaml 和 .env.example，明确设置应用及依赖镜像、数据库密码、MinIO 管理账号与独立应用账号。生产镜像应选部署方审核过的版本或摘要。Compose 不自动创建应用桶和权限。

```sh
docker compose up -d postgres minio
docker compose --profile bootstrap run --rm minio-bootstrap
docker compose up -d server
```

bootstrap 是一次性配置：创建私有桶、独立应用账号及 blobs/* 读取/写入策略，遇到已有账号或策略会拒绝覆盖。日常运维不重复运行它。正常 API 无删除对象权限；离线回收需要单独授权的维护账号。

server 默认只发布到本机回环端口，前置代理终止 HTTPS。容器只读根文件系统、私有数据卷和临时目录，capabilities 全部移除；Git/SSH 临时内容和扫描在临时目录工作。为 /tmp 按最大作业实际需求配置容量。

## 验收

- /health/live 表示进程存活，/health/ready 校验数据库和内容存储。
- 检查非 root 用户、编译入口、SQL/Schema/扫描资产及静态页面实际存在。
- 初始化账号，走上传、扫描、独立审核、权限收窄和公开访问链路。
- 使用真实目标 Agent 客户端核验 MCP 协议、变量和配置，不把生成文本视为已连接成功。

运维脚本在镜像内为 `node scripts/backup.js`、`restore-import.js`、`restore-check.js`、`maintenance.js` 、`recover-account.js` 和 `migrate.js`。对现有实例操作前明确数据卷与配置；服务启动与迁移命令均会应用当前迁移历史中的待执行变更，不转换未纳入当前迁移体系的旧数据库。部署前审查 SQL 并备份，详见[数据库迁移](../development/database-migrations.md)。
