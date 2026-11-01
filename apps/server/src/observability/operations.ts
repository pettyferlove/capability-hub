import { contentScanRuleset } from '@capability-hub/domain/content';
import type { JobRecord } from '@capability-hub/domain/models';
import { aiExecutionErrorLabels } from '@capability-hub/contracts';
import type { AgentExecutionDay, OperationsResponse } from '@capability-hub/contracts/http';
import type { AiError, AiRuntime, AiStore } from '@capability-hub/ai';
import { statfs } from 'node:fs/promises';
import type { HubServices } from '../bootstrap/hub-services.js';
import type { HubWorker } from '../workers/hub-worker.js';

const bounds = [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 30000, Infinity];
const executionErrorCodes = new Set(
  Object.keys(aiExecutionErrorLabels satisfies Record<AiError['code'], string>),
);

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

function counts(rows: { state: string }[]) {
  const result: Record<string, number> = {};
  for (const row of rows) result[row.state] = (result[row.state] ?? 0) + 1;
  return result;
}

function jobSnapshot(jobs: JobRecord[]) {
  const oldest = jobs
    .filter((job) => job.state === 'queued')
    .map((job) => job.created_at)
    .sort()[0];
  const latest = jobs
    .filter((job) => job.state === 'failed')
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 8)
    .map((job) => ({
      kind: job.kind,
      error_code: job.last_error_code ?? null,
      created_at: job.created_at,
    }));
  return {
    by_state: counts(jobs),
    oldest_wait_seconds: oldest
      ? Math.max(0, Math.floor((Date.now() - Date.parse(oldest)) / 1000))
      : 0,
    retrying: jobs.filter((job) => ['queued', 'running'].includes(job.state) && job.attempt > 0)
      .length,
    expired_leases: jobs.filter((job) => job.state === 'running' && job.lease_until < Date.now())
      .length,
    recent_failures: latest,
  };
}

async function diskSnapshot(dataDir: string): Promise<OperationsResponse['disk']> {
  try {
    const fs = await statfs(dataDir);
    return { available: true, free_bytes: fs.bavail * fs.bsize, total_bytes: fs.blocks * fs.bsize };
  } catch {
    return { available: false };
  }
}

async function probe(check: () => Promise<void>) {
  const start = performance.now();
  let available = true;
  try {
    await check();
  } catch {
    available = false;
  }
  return { available, duration_ms: Math.round(performance.now() - start) };
}

async function executionDays(store: AiStore, observedAt: Date): Promise<AgentExecutionDay[]> {
  const dayMs = 86_400_000;
  const beijingOffset = 8 * 3_600_000;
  const today = Math.floor((observedAt.getTime() + beijingOffset) / dayMs) * dayMs - beijingOffset;
  const start = today - 29 * dayMs;
  const rows = await store.summarizeExecutionDays(
    new Date(start).toISOString(),
    observedAt.toISOString(),
  );
  const days: AgentExecutionDay[] = Array.from({ length: 30 }, (_, i) => ({
    date: new Date(start + i * dayMs + beijingOffset).toISOString().slice(0, 10),
    counts: [],
  }));
  for (const { day_index, operation_id, status, error_code, count } of rows) {
    days[day_index].counts.push({
      operation_id,
      status,
      count,
      error_code: error_code && executionErrorCodes.has(error_code) ? error_code : null,
    });
  }
  return days;
}

async function agentSnapshot(
  runtime: AiRuntime,
  observedAt: Date,
): Promise<OperationsResponse['agents']> {
  const { profiles, default_profile, operations } = runtime.catalog();
  const [counts, daily_activity] = await Promise.all([
    runtime.store.summarizeExecutions().catch(() => null),
    executionDays(runtime.store, observedAt).catch(() => null),
  ]);
  return {
    profiles,
    default_profile,
    daily_activity,
    operations: operations.map(({ id, version, title }) => {
      const rows = counts?.filter((row) => row.operation_id === id);
      const activity = rows
        ? {
            by_status: Object.fromEntries(rows.map((row) => [row.status, row.count])),
            last_activity_at:
              rows
                .map((row) => row.last_activity_at)
                .sort()
                .at(-1) ?? null,
          }
        : null;
      return { id, version, title, activity };
    }),
  };
}

/** 各项独立采样。执行正文与存储凭据留在各自的权限边界内。 */
export async function operations(
  { store, blobs, ai, config }: HubServices,
  metrics: RequestMetrics,
  worker: HubWorker,
): Promise<OperationsResponse> {
  const observedAt = new Date();
  const [database, objects, size, jobs, scans, backups, agents, disk] = await Promise.all([
    probe(() => store.health()),
    probe(() => blobs.health()),
    store.sizeBytes().catch(() => null),
    store.all('jobs').catch(() => null),
    store.all('scans').catch(() => null),
    store.where('audit', 'action', 'backup.completed').catch(() => null),
    agentSnapshot(ai.runtime, observedAt),
    diskSnapshot(config.dataDir),
  ]);
  const storage = config.objectStorage;
  return {
    observed_at: observedAt.toISOString(),
    http: metrics.snapshot(),
    jobs: jobs && jobSnapshot(jobs),
    scans: scans && { by_state: counts(scans), ruleset: contentScanRuleset },
    last_backup_at: backups
      ? (backups
          .map((row) => row.occurred_at)
          .sort()
          .at(-1) ?? null)
      : undefined,
    agents,
    worker_state: worker.status,
    database: {
      ...database,
      driver: store.kind,
      size_bytes: size,
      pool_limit: config.database.driver === 'postgresql' ? config.database.poolSize : null,
    },
    object_storage:
      storage.driver === 'minio'
        ? {
            ...objects,
            driver: storage.driver,
            bucket: storage.bucket,
            prefix: storage.prefix,
            region: storage.region,
          }
        : { ...objects, driver: storage.driver },
    disk,
    memory_rss_bytes: process.memoryUsage().rss,
  };
}
