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
