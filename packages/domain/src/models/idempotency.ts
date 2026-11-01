import type { EpochMilliseconds } from './base.js';

/**
 * 幂等请求记录：`(principal_id, route, key)` 唯一，命中且未过期时直接回放 `response` 而不是重跑；
 * `request_hash` 不同则视为键复用（409 `IDEMPOTENCY_CONFLICT`），记录与业务写入必须在同一事务提交。
 */
export interface IdempotencyRecord {
  id: string;
  /** 发起者 id；查找范围限定在同一主体内，避免跨用户回放他人结果。 */
  principal_id: string;
  /** 业务路由标识（如 `intakes`），与 `key` 共同定位一次请求。 */
  route: string;
  /** 客户端 `Idempotency-Key` 原值，长度上限 200 字符。 */
  key: string;
  /** 请求内容的 `sha256:` 摘要，用于识别「同键不同请求」；身份授权另由事务内快照比对把关。 */
  request_hash: string;
  /** 首次执行的结果快照，原样回放；因此不得包含一次性凭据（如令牌明文）。 */
  response: unknown;
  /** 过期时刻 epoch 毫秒，目前保留 24 小时，过期记录在下次命中时清除。 */
  expires_at: EpochMilliseconds;
}
