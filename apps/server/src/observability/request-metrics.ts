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
