/**
 * 一次请求内使用的身份快照，由用户、成员关系、绑定和角色表即时拼出；
 * 它不随会话缓存，授权变更后下一次请求就生效。
 */
export interface Principal {
  id: string;
  username: string;
  display_name: string;
  /** 停用账号仍可解析出快照，但 {@link has} 对 `active` 为 false 一律拒绝。 */
  active: boolean;
  /** 用户记录修订号；幂等与鉴权快照比对据此判断身份是否在请求期间被改动。 */
  revision: number;
  /** 直接成员关系所属的团队 id，用于按团队受众过滤。 */
  groups: string[];
  /** 角色绑定；`scope_id` 只在非 platform 作用域下参与判定，platform 绑定对全局生效。 */
  bindings: { role_id: string; scope_type: ScopeType; scope_id: string }[];
  /** 角色表全量展开（role_id → 权限标识），判定时无需再查库。 */
  permissions: Record<string, string[]>;
}

/**
 * 会话记录的客户端指纹，仅用于展示与风险提示，不参与鉴权判定。
 */
export interface SessionClientInfo {
  browser_name: string | null;
  browser_version: string | null;
  os_name: string | null;
  device_type: 'desktop' | 'mobile' | 'tablet' | 'unknown';
}

/**
 * 角色绑定的作用域类型；`platform` 是唯一的全局作用域，其余都需要调用方提供同名作用域 id 才能命中。
 */
export type ScopeType = 'platform' | 'team' | 'source' | 'asset' | 'scenario';
