import type { ScopeType, SessionClientInfo } from '../identity.js';
import type { EpochMilliseconds, IsoDateTime, VersionedRecord } from './base.js';

/**
 * 账号记录。`password_hash` 只存哈希结果（含算法参数），永不外传；
 * 改密会在同一事务内吊销该账号全部会话，因此不需要在每次鉴权时重算口令。
 */
export interface UserRecord extends VersionedRecord {
  /** 在所属认证来源内唯一的小写用户名。 */
  username: string;
  display_name: string;
  /** 本地账号保存 scrypt 哈希；LDAP 账号仅保存目录条目标识。 */
  password_hash: string | null;
  ldap_entry_uuid?: string;
  /** 停用后不再能登录，且其令牌与连接鉴权立即失效；数据保留。 */
  active: boolean;
  created_at: IsoDateTime;
  avatar_color?: string;
  title?: string;
  bio?: string;
  email?: string;
}

/**
 * 团队记录，同时充当资产的所有者与分发受众（受众里的 `group:<id>`）。
 */
export interface GroupRecord extends VersionedRecord {
  name: string;
  /** 停用团队不再出现在受众可选范围，也不会因成员关系获得任何授权。 */
  active: boolean;
}

/**
 * 用户与团队的直接成员关系；关系存在即视为成员，删除记录即移除（没有软删除标记）。
 */
export interface MembershipRecord {
  id: string;
  user_id: string;
  group_id: string;
}

/**
 * 角色记录；`permissions` 的取值必须来自 `PERMISSIONS` 清单。
 */
export interface RoleRecord extends VersionedRecord {
  name: string;
  /** 内置角色的稳定键（`admin`/`maintainer`/`reviewer`/`reader`）；自定义角色无此字段。 */
  key?: string;
  /** 权限标识列表，判定时按字面量精确匹配。 */
  permissions: string[];
  /** 内置角色由初始化播种，不随代码改动回灌；自定义角色可自由增删权限。 */
  builtin: boolean;
}

/**
 * 把角色授予某个主体：`principal_id` 可以是用户 id，也可以是团队 id（团队授予对该团队全部成员生效）。
 * 只有 `scope_type` 为 `platform` 时绑定全局生效，其余必须与请求带来的作用域 id 相等。
 */
export interface RoleBindingRecord {
  id: string;
  /** 用户或团队的 id；指向团队时成员继承该角色。 */
  principal_id: string;
  role_id: string;
  scope_type: ScopeType;
  scope_id: string;
}

/**
 * 浏览器会话。`id` 是会话令牌的 SHA-256 摘要（明文只在 `hub_session` cookie 里），
 * 因此库泄露也无法直接冒用会话；固定 8 小时有效、不滑动续期，`revoked_at` 非空即失效。
 */
export interface SessionRecord {
  id: string;
  user_id: string;
  /** CSRF 口令（32 字节随机数的 base64url），随会话下发，写操作需回填；不随列表回显。 */
  csrf: string;
  created_at: IsoDateTime;
  /** 过期时刻 epoch 毫秒；与 cookie 的 `maxAge` 一致，到期不再续。 */
  expires_at: EpochMilliseconds;
  revoked_at: EpochMilliseconds | null;
  /** 终端指纹，仅用于展示与风险提示，不参与鉴权。 */
  client: SessionClientInfo | null;
}

/**
 * 个人访问令牌。`id` 为令牌明文的 SHA-256 摘要，明文只在签发时返回一次；
 * 记录不符合 `tokenRecordSchema` 时按记录损坏处理（409 `TOKEN_RECORD_INVALID`）。
 */
export interface TokenRecord {
  id: string;
  user_id: string;
  /** 用户自定义的令牌名称，1–80 字符。 */
  name: string;
  created_at: EpochMilliseconds;
  revoked_at: EpochMilliseconds | null;
  scope: 'hub:read' | 'hub:contribute';
}

/**
 * CLI（设备码）登录的一次性授权：`id` 是设备码摘要，`code` 是用户在网页输入的短码，
 * 状态机只能 `pending → approved → consumed`，因此同一次批准最多换到一枚令牌。
 */
export interface CliLoginRecord {
  id: string;
  /** 8 位大写十六进制用户码，仅在有效期内可被批准一次。 */
  code: string;
  /** PKCE challenge：轮询时用 `sha256(verifier)` 比对，verifier 必须在发起前确定。 */
  challenge: string;
  state: 'pending' | 'approved' | 'consumed';
  /** 10 分钟内有效，过期后既不能批准也不能兑换。 */
  expires_at: EpochMilliseconds;
  /** 批准时写入的账号 id；未批准时缺省。 */
  user_id?: string;
}

/**
 * 登录失败计数。`id` 是「客户端地址 + 归一化用户名」的 SHA-256 摘要，地址本身不落库；
 * 窗口 15 分钟，`failure_count` 达到 8 次后同一键在窗口内一律 429（`LOGIN_RATE_LIMIT`）；
 * 登录成功即删除整条记录，因此不需要定时清理。
 */
export interface LoginAttemptRecord {
  id: string;
  failure_count: number;
  window_expires_at: EpochMilliseconds;
}

/**
 * 动态注册的 OAuth 客户端（RFC 7591）：只支持公开客户端，没有密钥，安全性依赖回调白名单与强制 PKCE。
 */
export interface OAuthClientRecord {
  id: string;
  name: string;
  /** 回调白名单 1–10 条，逐条经 HTTPS（本机回环可用 HTTP）校验；匹配时主机、路径、查询须完全一致。 */
  redirect_uris: string[];
  created_at: number;
}

/**
 * 一次授权码流程的请求记录，10 分钟内有效。`code` 以摘要形式落库，
 * `status` 走到 `consumed` 后若同一 code 再次被兑换，会吊销整条授权并记 `identity.connection_replay`。
 */
export interface OAuthRequestRecord {
  id: string;
  client_id: string;
  redirect_uri: string;
  /** 授权目标，必须等于 `${issuer}/mcp`，否则拒绝。 */
  resource: string;
  scope: 'hub:read' | 'hub:contribute';
  /** PKCE challenge（`S256`，43 字符），兑换时与 `sha256(code_verifier)` 比对。 */
  challenge: string;
  /** 客户端回传的不透明 state，原样保存，用于防 CSRF 与串联回调。 */
  state: string;
  expires_at: number;
  status: 'pending' | 'approved' | 'denied' | 'consumed';
  /** 授权码摘要；`null` 表示尚未签发。 */
  code: string | null;
  user_id: string | null;
  /** 兑换成功后指向生成的授权，用于识别重放并连带吊销。 */
  grant_id: string | null;
}

/**
 * 已建立的连接授权（用户 × 客户端）。吊销即切断该连接的全部凭据；
 * 刷新时可带上新的 `scope`（不能一次加重到 `hub:contribute`，那需要重新授权），结果会写回本记录。
 */
export interface OAuthGrantRecord {
  id: string;
  client_id: string;
  user_id: string;
  /** 授权时的客户端名称快照，客户端改名后不影响历史展示。 */
  name: string;
  scope: 'hub:read' | 'hub:contribute';
  resource: string;
  created_at: number;
  /** 最近一次 Bearer 鉴权时间，最多每 60 秒写一次以避免鉴权路径频繁写库。 */
  last_used_at: number | null;
  revoked_at: number | null;
}

/**
 * 连接凭据。访问令牌 1 小时、刷新令牌 30 天；`id` 为令牌明文的 SHA-256 摘要。
 * 刷新令牌一次性使用：`consumed_at` 非空仍被再次使用即判定重放，整条授权被吊销。
 */
export interface OAuthCredentialRecord {
  id: string;
  grant_id: string;
  kind: 'access' | 'refresh';
  expires_at: number;
  /** 刷新令牌的消费时间；访问令牌置空。 */
  consumed_at: number | null;
}
