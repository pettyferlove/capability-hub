import type { RecordStore } from '@capability-hub/application/ports';
import type { ResourceActivityResponse } from '@capability-hub/contracts';

/** 今天只计到采样时刻；成功取数后才为没有事件的日期补零。 */
export async function resourceActivity(
  store: RecordStore,
  days: '7' | '30',
): Promise<ResourceActivityResponse> {
  const observedAt = new Date();
  const dayMs = 86_400_000;
  const offset = 8 * 3_600_000;
  const start =
    Math.floor((observedAt.getTime() + offset) / dayMs) * dayMs -
    offset -
    (Number(days) - 1) * dayMs;
  const rows = await store.summarizeResourceActivity(
    new Date(start).toISOString(),
    observedAt.toISOString(),
  );
  const daily: ResourceActivityResponse['daily'] = Array.from({ length: Number(days) }, (_, i) => ({
    date: new Date(start + offset + i * dayMs).toISOString().slice(0, 10),
    first_releases: 0,
    repeat_releases: 0,
    downloads: 0,
    skill_loads: 0,
    install_requests: 0,
    feedback_pending: 0,
    feedback_in_progress: 0,
    feedback_resolved: 0,
    feedback_declined: 0,
  }));
  const byDate = new Map(daily.map((day) => [day.date, day]));
  for (const row of rows) {
    const day = byDate.get(row.date);
    if (!day) throw new Error('资源趋势超出统计窗口');
    day[row.metric] = row.count;
  }
  return { observed_at: observedAt.toISOString(), daily };
}
