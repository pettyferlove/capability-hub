/**
 * 运维巡检快照，出现在运维页：HTTP 指标统计自 `http.since` 起的累计值，
 * 队列与扫描计数为当前状态，磁盘信息在探测失败时只有 `available: false`。
 */
export interface OperationsResponse {
  observed_at: string;
  memory_rss_bytes: number;
  last_backup_at: string | null;
  http: {
    since: string;
    requests: number;
    active: number;
    aborted: number;
    by_status: Record<string, number>;
    errors: Record<string, number>;
    mean_duration_ms: number | null;
    duration_buckets: { upper_ms: number | null; count: number; cumulative: number }[];
  };
  jobs: {
    by_state: Record<string, number>;
    oldest_wait_seconds: number;
    retrying: number;
    expired_leases: number;
    recent_failures: { kind: string; error_code: string | null; created_at: string }[];
  };
  scans: { by_state: Record<string, number>; ruleset: string };
  disk: { available: boolean; free_bytes?: number; total_bytes?: number };
}
