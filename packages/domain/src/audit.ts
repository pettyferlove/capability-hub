/**
 * 审计事件的一级分类，键写入事件、值是给界面看的简体中文标签；
 * 未登记的动作在查询侧一律归到 `other`，因此新增分类要同步前端筛选选项。
 */
export const auditCategories = {
  identity: '账号与权限',
  publication: '发布与审核',
  content: '资源使用',
  source: '来源与扫描',
  operations: '平台运维',
  other: '其他事件',
} as const;
/**
 * 审计分类的键集合。
 */
export type AuditCategory = keyof typeof auditCategories;
/**
 * 事件作用对象（主体）的种类，决定查询侧去哪张表还原对象名称；
 * 无法确定时用 `unknown`，不要猜一个更具体的种类。
 */
export type AuditSubjectKind =
  | 'user'
  | 'group'
  | 'role'
  | 'grant'
  | 'membership'
  | 'token'
  | 'session'
  | 'cli'
  | 'connection'
  | 'asset'
  | 'version'
  | 'intake'
  | 'publication'
  | 'source'
  | 'credential'
  | 'scenario'
  | 'instance'
  | 'unknown';
interface AuditDefinition {
  label: string;
  category: AuditCategory;
  subject: AuditSubjectKind;
  failure?: boolean;
}
/**
 * 审计动作的登记表：`label` 是界面文案，`category`/`subject` 决定筛选与对象还原，
 * `failure` 为 true 表示该动作按「操作失败」统计（即使记录里写了 success 也以失败计入）。
 * 未登记的动作不会失败，只是退回 `other` 分类与 `unknown` 主体，所以新增动作应在此登记。
 */
export const auditDefinitions: Record<string, AuditDefinition> = {
  'identity.bootstrap': { label: '初始化能力库', category: 'identity', subject: 'user' },
  'identity.login': { label: '登录账号', category: 'identity', subject: 'user' },
  'identity.login_failed': {
    label: '登录失败',
    category: 'identity',
    subject: 'user',
    failure: true,
  },
  'identity.logout': { label: '退出登录', category: 'identity', subject: 'user' },
  'identity.profile_updated': { label: '更新个人资料', category: 'identity', subject: 'user' },
  'identity.password_changed': { label: '修改账号密码', category: 'identity', subject: 'user' },
  'identity.local_password_recovered': {
    label: '本地恢复账号',
    category: 'identity',
    subject: 'user',
  },
  'identity.user_created': { label: '创建账号', category: 'identity', subject: 'user' },
  'identity.user_updated': { label: '更新账号', category: 'identity', subject: 'user' },
  'identity.group_created': { label: '创建团队', category: 'identity', subject: 'group' },
  'identity.group_updated': { label: '更新团队', category: 'identity', subject: 'group' },
  'identity.role_created': { label: '创建角色', category: 'identity', subject: 'role' },
  'identity.role_updated': { label: '更新角色', category: 'identity', subject: 'role' },
  'identity.role_granted': { label: '授予角色', category: 'identity', subject: 'grant' },
  'identity.membership_added': {
    label: '添加团队成员',
    category: 'identity',
    subject: 'membership',
  },
  'identity.grant_removed': { label: '回收授权', category: 'identity', subject: 'grant' },
  'identity.connection_approved': {
    label: '批准 Agent 连接',
    category: 'identity',
    subject: 'connection',
  },
  'identity.connection_denied': {
    label: '取消 Agent 连接',
    category: 'identity',
    subject: 'connection',
  },
  'identity.connection_revoked': {
    label: '断开 Agent 连接',
    category: 'identity',
    subject: 'connection',
  },
  'identity.connection_replay': {
    label: '重放凭据导致连接撤销',
    category: 'identity',
    subject: 'connection',
    failure: true,
  },
  'identity.token_created': { label: '创建 Hub 访问令牌', category: 'identity', subject: 'token' },
  'identity.token_revoked': { label: '撤销 Hub 访问令牌', category: 'identity', subject: 'token' },
  'identity.session_revoked': { label: '撤销登录会话', category: 'identity', subject: 'session' },
  'identity.cli_approved': { label: '批准 CLI 登录', category: 'identity', subject: 'cli' },
  'credential.created': { label: '新增 Git 凭据', category: 'identity', subject: 'credential' },
  'credential.rotated': { label: '轮换 Git 凭据', category: 'identity', subject: 'credential' },
  'credential.revoked': { label: '撤销 Git 凭据', category: 'identity', subject: 'credential' },
  'publication.submitted': {
    label: '提交发布申请',
    category: 'publication',
    subject: 'publication',
  },
  'publication.nominated': { label: '提名为通用', category: 'publication', subject: 'publication' },
  'publication.approved': {
    label: '审核通过并发布',
    category: 'publication',
    subject: 'publication',
  },
  'publication.rejected': {
    label: '退回发布申请',
    category: 'publication',
    subject: 'publication',
  },
  'publication.cancelled': { label: '撤回申请', category: 'publication', subject: 'publication' },
  'asset.active': { label: '恢复资源', category: 'publication', subject: 'asset' },
  'asset.usage_updated': { label: '更新使用要求', category: 'publication', subject: 'asset' },
  'asset.blocked': { label: '封禁资源', category: 'publication', subject: 'asset' },
  'asset.deprecated': { label: '弃用资源', category: 'publication', subject: 'asset' },
  'asset.source_migrated': { label: '迁移资源来源', category: 'publication', subject: 'asset' },
  'version.revoked': { label: '撤销资源版本', category: 'publication', subject: 'version' },
  'content.management_read': { label: '审查内容快照', category: 'content', subject: 'version' },
  'asset.management_versions': { label: '查看维护版本', category: 'content', subject: 'asset' },
  'content.download': { label: '下载资源', category: 'content', subject: 'version' },
  'skill.loaded': { label: '加载 Skill', category: 'content', subject: 'version' },
  'skill.installation_prepared': {
    label: '获取 Skill 安装包',
    category: 'content',
    subject: 'version',
  },
  'asset.recommended': { label: '推荐资源', category: 'content', subject: 'version' },
  'asset.feedback_submitted': { label: '提交资源反馈', category: 'content', subject: 'version' },
  'asset.feedback_updated': { label: '处理资源反馈', category: 'content', subject: 'version' },
  'asset.recommendation_removed': { label: '取消推荐', category: 'content', subject: 'version' },
  'source.created': { label: '登记 Git 来源', category: 'source', subject: 'source' },
  'source.updated': { label: '更新 Git 来源', category: 'source', subject: 'source' },
  'source.sync_requested': { label: '请求 Git 同步', category: 'source', subject: 'source' },
  'source.distribution_revoked': {
    label: '撤销来源分发授权',
    category: 'source',
    subject: 'source',
  },
  'intake.received': { label: '接收上传内容', category: 'source', subject: 'intake' },
  'intake.ready': { label: '内容扫描通过', category: 'source', subject: 'intake' },
  'intake.failed': { label: '内容扫描失败', category: 'source', subject: 'intake', failure: true },
  'intake.rescan_requested': { label: '请求重新扫描', category: 'source', subject: 'intake' },
  'scenario.created': { label: '登记适用场景', category: 'publication', subject: 'scenario' },
  'backup.completed': { label: '完成数据备份', category: 'operations', subject: 'instance' },
};

/**
 * 操作者快照：`actor_id` 为 `anonymous`/`system`/`local-recovery` 等保留值时不会去用户表查，
 * 解析不到用户则降级为 `unknown`，而不是让整条审计失败。
 */
export interface AuditActorSnapshot {
  kind: 'user' | 'anonymous' | 'system' | 'unknown';
  name: string;
  username?: string;
}
/**
 * 审计对象快照（写入记录时冗余保存）：只保留展示字段与跳转用 id，
 * 因此对象被删除或改名后，历史记录仍能如实呈现当时的样子，也不会泄露凭据或记录正文。
 */
export interface AuditSubjectSnapshot {
  kind: AuditSubjectKind;
  name: string;
  detail: string;
  /** 资源类对象所属资产 id，用于生成「查看资产」链接；非资源类对象不填。 */
  asset_id?: string;
  version_id?: string;
  request_id?: string;
}
