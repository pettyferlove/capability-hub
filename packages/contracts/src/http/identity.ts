import type { SessionClientInfo } from '../identity.js';
import type { ScopeType } from '../identity.js';

/**
 * 当前登录主体，出现在 `/api/me`；前端据 `capabilities` 决定展示哪些入口，
 * 真正的权限校验仍在服务端。
 */
export interface MeResponse {
  id: string;
  username: string;
  display_name: string;
  avatar_color?: string;
  groups: { id: string; name: string }[];
  /** 由角色与作用域推导的能力开关，不等同于 RBAC 权限名。 */
  capabilities: {
    can_ai: boolean;
    can_admin: boolean;
    can_audit: boolean;
    can_manage_assets?: boolean;
    can_publish: boolean;
    can_review: boolean;
  };
  /** `git_hosts` 为部署方允许登记的 Git 托管域，界面据此给出候选与提示。 */
  features: { git_hosts: string[] };
  /** 写请求必须通过 `x-csrf-token` 原样带回，缺失或不匹配返回 403。 */
  csrf_token: string;
}

/** 未登录也能读取的登录状态，出现在登录/初始化页。 */
export interface AuthStatusResponse {
  initialized: boolean;
  /** 仅在尚未初始化时有意义：初始化请求是否需要一次性口令。 */
  setup_token_required: boolean;
  auth_provider: string;
  oidc_enabled: boolean;
}

/** 用户公开资料，出现在成员列表与资料页；可选字段缺失表示未填写。 */
export interface PublicUserResponse {
  id: string;
  revision: number;
  username: string;
  display_name: string;
  active: boolean;
  created_at: string;
  avatar_color?: string;
  title?: string;
  bio?: string;
  email?: string;
}

/** 组（团队），既是资产所有者也是角色授予的作用域。 */
export interface GroupResponse {
  id: string;
  revision: number;
  name: string;
  active: boolean;
}

/** 用户与组的成员关系；删除关系即移除该用户在此组内的所有作用域权限。 */
export interface MembershipResponse {
  id: string;
  user_id: string;
  group_id: string;
}

/** 角色及其权限名集合；内置角色只读，改写会返回冲突。 */
export interface RoleResponse {
  id: string;
  revision: number;
  name: string;
  /** 内置角色的稳定标识，自定义角色无此字段。 */
  key?: string;
  permissions: string[];
  builtin: boolean;
}

/** 主体—角色—作用域三元组，是权限判定的基本单位。 */
export interface RoleBindingResponse {
  id: string;
  principal_id: string;
  role_id: string;
  scope_type: ScopeType;
  scope_id: string;
}

/** 身份管理页的一次性快照：用户、组、成员关系、角色与授予一并下发，前端据此自连接渲染。 */
export interface IdentitySnapshotResponse {
  users: PublicUserResponse[];
  groups: GroupResponse[];
  memberships: MembershipResponse[];
  roles: RoleResponse[];
  bindings: RoleBindingResponse[];
  permissions: string[];
}

/** 个人资料页：在 {@link PublicUserResponse} 基础上补齐本人可见字段与统计。 */
export type ProfileResponse = Pick<
  PublicUserResponse,
  'id' | 'username' | 'display_name' | 'revision' | 'created_at'
> & {
  title: string;
  bio: string;
  email: string;
  avatar_color: string;
  roles: { name?: string; scope_type: string; scope_id: string }[];
  stats: { submissions: number; decisions: number; credentials: number };
};

/** 登录会话，出现在会话管理列表；`expires_at` 为毫秒时间戳，`current` 标记本请求所在的会话。 */
export interface SessionResponse {
  id: string;
  created_at: string;
  expires_at: number;
  client: SessionClientInfo | null;
  current: boolean;
}

/**
 * 个人访问令牌的元数据。`id` 是令牌明文的 sha256 摘要，兼作主键与吊销引用，
 * 因此列表永远不会暴露明文。
 */
export interface TokenResponse {
  id: string;
  name: string;
  created_at: number;
  revoked_at: number | null;
  scope: 'hub:read' | 'hub:contribute';
}

/** 签发结果：明文令牌只在此处返回一次，之后无法再次获取，遗失只能重新签发。 */
export interface IssuedTokenResponse {
  token: string;
}

/** CLI 登录轮询结果；`pending` 时客户端需继续轮询，`complete` 才带令牌。 */
export type CliLoginPollResponse =
  { state: 'pending' } | ({ state: 'complete' } & IssuedTokenResponse);

/** 个人活动流条目：该用户最近 50 条审计事件，按时间倒序；`entity_id` 指向事件关联实体。 */
export interface ActivityResponse {
  id: string;
  occurred_at: string;
  action: string;
  action_label: string;
  entity_id: string;
  result: 'success' | 'failure';
}
