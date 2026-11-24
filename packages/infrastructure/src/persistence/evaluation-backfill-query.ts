import { sql } from 'drizzle-orm';

/** 只返回当前发布的主键；使用量按资产汇总，拥有相同冻结声明的评测已覆盖本次回填。 */
export function evaluationBackfillCandidates(
  rubric: string,
  evaluator: string | null,
  since: string,
) {
  const matches =
    evaluator === null
      ? sql`e.evaluator_digest is null`
      : sql`
    e.evaluator_digest = ${evaluator}
    and (e.data ->> 'audience_class') = case when (r.data -> 'distribution' -> 'audience' ->> 0) = 'public' then 'public' else 'signed_in' end
    and (case when cast(e.data ->> 'requires_api_key' as text) in ('true','1') then 1 else 0 end)
      = (case when cast(r.data ->> 'requires_api_key' as text) in ('true','1') then 1 else 0 end)`;
  return sql`(
    select r.id as release_id from assets a
    join releases r on r.id = a.current_release_id
    join versions v on v.id = r.version_id
    left join (
      select used.asset_id, count(*) as total from audit events
      join versions used on used.id = (events.data ->> 'entity_id')
      where events.occurred_at >= ${since} and (events.data ->> 'result') = 'success'
        and (events.data ->> 'action') in ('content.download', 'skill.loaded', 'skill.installation_prepared')
      group by used.asset_id
    ) activity on activity.asset_id = a.id
    where (a.data ->> 'kind') = 'skill' and (a.data ->> 'lifecycle') <> 'blocked'
      and (v.data ->> 'availability') = 'released'
      and not exists (select 1 from resource_evaluations e where e.version_id = r.version_id
        and e.rubric_version = ${rubric} and ${matches} and e.state <> 'cancelled')
    order by coalesce(activity.total, 0) desc, a.id limit 1
  ) as candidate`;
}
