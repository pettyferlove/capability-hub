import type { AiExecutionResponse } from '../../ai.js';
import type { AiCatalogResponse } from './agents.js';

interface StorageProbe {
  available: boolean;
  duration_ms: number;
}

/** 按北京时间的创建日期统计保留的执行，状态取采样时的值。 */
export interface AgentExecutionDay {
  date: string;
  counts: {
    operation_id: string;
    status: AiExecutionResponse['status'];
    error_code: string | null;
    count: number;
  }[];
}

/**
 * HTTP 计数自 `http.since` 起累计。作业、扫描或 Agent 活动为 null 时表示采样失败，
 * 成功采样后的空计数表示没有记录。
 */
export interface OperationsResponse {
  observed_at: string;
  memory_rss_bytes: number;
  /** null 表示没有成功备份记录；读取备份审计失败时省略。 */
  last_backup_at?: string | null;
  /** 当前保留的成功备份审计记录数，读取失败时省略。 */
  backup_record_count?: number;
  worker_state: 'stopped' | 'idle' | 'busy';
  database: StorageProbe & {
    driver: 'sqlite' | 'postgresql';
    size_bytes: number | null;
    pool_limit: number | null;
  };
  object_storage: StorageProbe &
    (
      { driver: 'filesystem' } | { driver: 'minio'; bucket: string; prefix: string; region: string }
    );
  agents: Pick<AiCatalogResponse, 'profiles' | 'default_profile'> & {
    daily_activity: AgentExecutionDay[] | null;
    operations: {
      id: string;
      title: string;
      version: string;
      activity: {
        by_status: Partial<Record<AiExecutionResponse['status'], number>>;
        last_activity_at: string | null;
      } | null;
    }[];
  };
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
  } | null;
  scans: { by_state: Record<string, number>; ruleset: string } | null;
  disk: { available: boolean; free_bytes?: number; total_bytes?: number };
}
