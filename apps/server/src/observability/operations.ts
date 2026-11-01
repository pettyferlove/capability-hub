import { contentScanRuleset } from '@capability-hub/domain/content';
import type { RecordStore } from '@capability-hub/application/ports';
import { statfsSync } from 'node:fs';

const bounds = [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 30000, Infinity];

/**
 * 进程内请求指标累加器：只做自增、不加锁，依赖 Node 单线程保证一致，进程重启即归零；
 * `snapshot` 返回拷贝，调用方改动不会影响计数器。
 */
export class RequestMetrics {
  startedAt = new Date().toISOString();
  active = 0;
  aborted = 0;
  total = 0;
  durationSum = 0;
  statuses: Record<string, number> = {};
  errors: Record<string, number> = {};
  buckets = Array(bounds.length).fill(0) as number[];
  error(code: string) {
    this.errors[code] = (this.errors[code] ?? 0) + 1;
  }
  record(status: number, duration: number) {
    this.total++;
    this.durationSum += duration;
    this.statuses[status] = (this.statuses[status] ?? 0) + 1;
    const bucket = bounds.findIndex((bound) => duration <= bound);
    this.buckets[bucket]++;
  }
  snapshot() {
    let cumulative = 0;
    return {
      since: this.startedAt,
      requests: this.total,
      active: this.active,
      aborted: this.aborted,
      by_status: { ...this.statuses },
      errors: { ...this.errors },
      mean_duration_ms: this.total ? Math.round((this.durationSum / this.total) * 100) / 100 : null,
      duration_buckets: this.buckets.map((count, index) => ({
        upper_ms: Number.isFinite(bounds[index]) ? bounds[index] : null,
        count,
        cumulative: (cumulative += count),
      })),
    };
  }
}

/**
 * 运维快照，一次读三张表：作业与扫描按状态计数，`backup.completed` 审计给出最近备份时间。
 * `dataDir` 只用于 `statfs`，探测失败时 `disk.available` 为 false 而不是抛错——磁盘不可探查
 * 本身就是需要被看到的信号。`expired_leases` 与 `oldest_wait_seconds` 是排查 worker 卡死的入口。
 */
export async function operations(store: RecordStore, metrics: RequestMetrics, dataDir: string) {
  const [jobs, scans, audits] = await Promise.all([
    store.all('jobs'),
    store.all('scans'),
    store.where('audit', 'action', 'backup.completed'),
  ]);
  const counts = (
    rows: {
      state: string;
    }[],
  ) => {
    const result: Record<string, number> = {};
    for (const row of rows) result[row.state] = (result[row.state] ?? 0) + 1;
    return result;
  };
  const oldest = jobs
    .filter((job) => job.state === 'queued')
    .map((job) => job.created_at)
    .sort()[0];
  const backups = audits.sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
  const latest = jobs
    .filter((job) => job.state === 'failed')
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 8)
    .map((job) => ({
      kind: job.kind,
      error_code: job.last_error_code,
      created_at: job.created_at,
    }));
  let disk: {
    available: boolean;
    free_bytes?: number;
    total_bytes?: number;
  };
  try {
    const fs = statfsSync(dataDir);
    disk = { available: true, free_bytes: fs.bavail * fs.bsize, total_bytes: fs.blocks * fs.bsize };
  } catch {
    disk = { available: false };
  }
  return {
    observed_at: new Date().toISOString(),
    http: metrics.snapshot(),
    jobs: {
      by_state: counts(jobs),
      oldest_wait_seconds: oldest
        ? Math.max(0, Math.floor((Date.now() - Date.parse(oldest)) / 1000))
        : 0,
      retrying: jobs.filter((job) => ['queued', 'running'].includes(job.state) && job.attempt > 0)
        .length,
      expired_leases: jobs.filter((job) => job.state === 'running' && job.lease_until < Date.now())
        .length,
      recent_failures: latest,
    },
    scans: { by_state: counts(scans), ruleset: contentScanRuleset },
    disk,
    last_backup_at: backups[0]?.occurred_at ?? null,
    memory_rss_bytes: process.memoryUsage().rss,
  };
}
