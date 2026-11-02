import type { ResourceActivityBucket } from '@capability-hub/application/ports';
import { count, sql, type SQL } from 'drizzle-orm';

/** 三类事实独立计数，避免同一资源的多次发布、使用和反馈互相放大。 */
export function resourceActivityQuery(
  dialect: 'sqlite' | 'postgresql',
  from: string,
  through: string,
) {
  const at = sql`activity.event_at`;
  const instant = (value: SQL) =>
    dialect === 'sqlite' ? sql`julianday(${value})` : sql`cast(${value} as timestamptz)`;
  const date =
    dialect === 'sqlite'
      ? sql<string>`date(${at}, '+8 hours')`
      : sql<string>`to_char((${instant(at)} at time zone 'UTC') + interval '8 hours', 'YYYY-MM-DD')`;
  const metric = sql<ResourceActivityBucket['metric']>`activity.metric`;
  return {
    fields: { date: date.as('activity_day'), metric, count: count() },
    source: sql`(
      select data ->> 'published_at' as event_at,
        case when release_seq = 1 then 'first_releases' else 'repeat_releases' end as metric
      from releases
      union all
      select occurred_at,
        case data ->> 'action' when 'content.download' then 'downloads' when 'skill.loaded' then 'skill_loads' else 'install_requests' end
      from audit
      where (data ->> 'action') in ('content.download', 'skill.loaded', 'skill.installation_prepared') and (data ->> 'result') = 'success'
      union all
      select data ->> 'created_at', 'feedback_' || (data ->> 'status') from asset_feedback
    ) as activity`,
    range: sql`${instant(at)} between ${instant(sql`${from}`)} and ${instant(sql`${through}`)}`,
    group: [sql`activity_day`, metric] as const,
  };
}
