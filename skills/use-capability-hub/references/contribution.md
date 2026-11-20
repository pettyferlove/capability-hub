# 通过 MCP 向 Hub 贡献

分享、推荐和固定版本反馈需要 `hub:contribute`，仍受账号权限限制。OAuth 客户端追加此范围须用户批准；预设客户端可从 `/connect?client=CLIENT&permission=contribute` 获取指令。使用 Bearer 时，由用户在 `/account?tab=security` 创建贡献范围令牌并更新客户端私有凭据，Agent 不读取真实值。重新连接并刷新工具；无法授权时改用网页。

## 把本地 Skill 分享给团队

1. 确定 `version_label` 和清单，只提交用户选定目录的文件，包含根目录 `SKILL.md` 和全部引用的附属资料，排除凭据和私人记录。超过 100 个文件或解码后总量超过 512 KiB 时改走网页 ZIP 上传。
2. 新建前调用 `list_share_teams`，从已加入且有创建权限的团队中选择归属，填写 `target: new`、`slug` 及返回的 `id`（`destination.owner_group_id`）。多个候选归属不明时让用户选名称，禁止猜 ID；空列表请管理员确认成员关系及创建权限。更新上传资产用 `target: existing`，`asset_id` 可填 UUID 或已知 slug；Git 资产从登记来源同步。
3. 返回 `submitted_for_scanning` 时报告“已提交扫描”，给出 `publication_url` 供用户选择受众并提交独立审核。

## 推荐资源或上报版本反馈

- **“给刚用的资源点推荐”**。用目录结果的 `asset_id` 调用 `rate_asset`，推荐时传 `recommended: true`，取消时传 `false`。
- **“把这个问题反馈给维护者”**。有本次或预先授予的上报授权时，才对固定版本调用 `report_asset_feedback` 并传 `consent: true`。按缺陷、能力缺口或改进建议选择 `kind`，写明标题、使用场景、预期和实际结果，区分观察与推断。只提交脱敏的最小复现，成功后交付返回的 `detail_url`。
- **“Hub 的连接、授权或网页有问题”**。不调用 `report_asset_feedback`，按 [CLI 平台反馈](cli.md#反馈-hub-本身)预览并经用户确认后提交，无需 `hub:contribute`。

同一次提交或反馈重试时，保持请求内容和 `idempotency_key` 一致，提交 Skill 使用 UUID。
