import type { AuditCategory } from '@capability-hub/domain/audit';

/**
 * 审计列表的过滤条件，来源是 HTTP `GET` 的 query，由 `auditLogQuerySchema` 解析并补默认值；
 * 调用方还需持有 `audit:read`，服务内部不重复校验。
 */
export interface AuditLogQuery {
  /** 按空白切分后每个词都须命中；NFKC + 小写后做子串匹配，上限 200 字符。 */
  q?: string;
  /** `all` 表示不按类别过滤；类别本身由 `auditDefinitions` 从动作名推导。 */
  category?: 'all' | AuditCategory;
  /** `all` 表示成功与失败都返回。 */
  result?: 'all' | 'success' | 'failure';
  /** 发生时间下界，ISO 8601 带时区偏移，闭区间。 */
  from?: string;
  /** 发生时间上界，闭区间；契约层已保证不早于 `from`。 */
  to?: string;
  /** 从 1 开始；超出末页时夹到最后一页，不返回空页。 */
  page?: number;
  /** 契约层只放行 5/10/20/50，默认 20；决定切片宽度也决定总页数。 */
  page_size?: number;
}
