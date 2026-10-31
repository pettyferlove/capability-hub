# 备份、恢复与维护

## 备份

```sh
pnpm backup /SAFE_BACKUP_PATH
```

记录从同一事务快照读取，随后复制所有引用内容，生成 records.json、blobs/ 和带摘要的 backup.json。目标目录必须尚不存在，文件使用私有权限。在线备份期间禁止并行离线内容回收。

将 CAPABILITY_HUB_INSTANCE_SECRET 或开发 instance.key 单独加密保存；备份内容包含密码哈希和加密凭据，同样按敏感资料管理。备份脚本成功不等于已完成异地保存或恢复演练。

## 恢复

停止目标 API/Worker，指向空的当前版本数据库及目标内容存储，使用原实例密钥：

```sh
pnpm restore:import /SAFE_BACKUP_PATH
pnpm restore:check
```

导入校验记录文件摘要、每表结构和每个内容对象；数据库写入整体事务提交。非空数据库拒绝导入。失败前已写入但未引用的内容对象可在后续停机维护时回收。

restore:check 检查全部原始包、版本文件、清单、归档和当前发布指针；成功后将 running 作业重新排队并增加租约代次。随后启动服务，验证权限、封禁/撤销状态和实际业务链路。没有旧格式升级或自动修复内容。

## 维护与账号恢复

```sh
pnpm maintenance
pnpm maintenance --collect-blobs
pnpm account:recover --username ACCOUNT
```

默认维护清理过期幂等、CLI 授权和登录窗口。collect-blobs 只在 API 与 Worker 全部停止后执行，删除至少 24 小时未被任何版本或 intake 引用的内容。MinIO 维护身份需另行授予删除权限，不能扩大日常 API 账号权限。

账号恢复必须在有实例数据访问权限的本地交互终端执行；两次隐藏输入新密码，恢复账号并撤销其网页会话，追加恢复审计。个人 CLI/MCP 令牌按其生命周期管理，需时单独撤销。

日志通过标准输出交由部署平台收集。故障先检查 readiness、数据库/对象服务、作业状态及错误代码；不要开启记录秘密原文、上传内容或 SQL 参数的诊断。
