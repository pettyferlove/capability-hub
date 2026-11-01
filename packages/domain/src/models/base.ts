/**
 * UTC 的 ISO 8601 字符串（`Date.toISOString()` 产物，如 `2026-01-02T03:04:05.678Z`）。
 * 统一用字符串而非 `Date`：可以直接按字典序比较与排序，也避免序列化时被时区改写。
 */
export type IsoDateTime = string;

/**
 * 自 Unix 纪元起的毫秒数（`Date.now()`）。用于过期判断与租约这类需要直接比较的数字场景，
 * 不要用秒，也不要与 {@link IsoDateTime} 混填到同一字段。
 */
export type EpochMilliseconds = number;

/**
 * 带乐观并发控制的可变记录基类。
 */
export interface VersionedRecord {
  id: string;
  /**
   * 单调递增的修订号，每次写入 `+1`；对外以 `ETag: "<revision>"` 呈现，
   * 调用方带 `If-Match` 不匹配时写入方必须返回冲突而不是覆盖。
   */
  revision: number;
}
