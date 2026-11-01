/** 已授权 Agent 连接的对外视图，出现在 `/api/connections` 列表；断开只标记撤销，不删除记录。 */
export interface ConnectionResponse {
  id: string;
  name: string;
  /** `hub:contribute` 已包含读取权限；提权必须重新走授权流程。 */
  scope: 'hub:read' | 'hub:contribute';
  /** 毫秒时间戳，与仓库其他时间戳口径一致。 */
  created_at: number;
  /** 最近访问时间（毫秒）；为避免每次请求写库，只在距上次记录超过 60 秒时更新。 */
  last_used_at: number | null;
  /** 撤销时间（毫秒），`null` 表示仍有效；撤销后立即失去访问权。 */
  revoked_at: number | null;
}
/**
 * 待确认的连接授权请求，出现在 `/api/connections/authorize/:id`。
 * 请求创建后 10 分钟过期，过期或已处理的 id 一律按无效授权处理。
 */
export interface ConnectionAuthorizationResponse {
  client_name: string;
  /** 取自回调地址的 origin，用于告知用户将跳转到哪里。 */
  redirect_origin: string;
  resource: string;
  /** 客户端申请的权限；批准时授予范围不会超过它。 */
  scope: 'hub:read' | 'hub:contribute';
  /** 过期时间（毫秒），超时后不能再批准。 */
  expires_at: number;
}
