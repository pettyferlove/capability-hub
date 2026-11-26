import type { EvaluationSummary } from '@capability-hub/application/ports';
import { evaluationBand } from '@capability-hub/domain/evaluation';
import { evaluationScoredDimensionSchema } from '@capability-hub/domain/models';
import { inArray, sql } from 'drizzle-orm';

/** 先按版本索引和冻结声明选定一份评测，再展开其维度；缺分不从次选评测补齐。 */
export function evaluationSummaryQuery(
  dialect: 'sqlite' | 'postgresql',
  releaseIds: readonly string[],
  rubric: string,
) {
  const sqlite = dialect === 'sqlite';
  const isPublic = sqlite
    ? sql`exists (select 1 from json_each(r.data, '$.distribution.audience') where value = 'public')`
    : sql`(r.data -> 'distribution' -> 'audience') ? 'public'`;
  const dimensions = sqlite
    ? sql`json_each(chosen.data, '$.dimensions') dim`
    : sql`jsonb_array_elements(chosen.data -> 'dimensions') with ordinality as dim(value, position)`;
  const score = sqlite
    ? sql`case when json_type(dim.value, '$.score') in ('integer', 'real') then dim.value ->> 'score' end`
    : sql`case when jsonb_typeof(dim.value -> 'score') = 'number' then (dim.value ->> 'score')::float8 end`;
  return {
    fields: {
      releaseId: sql<string>`r.id`,
      id: sql`dim.value ->> 'id'`,
      score,
      confidence: sql`dim.value ->> 'confidence'`,
    },
    source: sql`releases r join versions v on v.id = r.version_id
      join resource_evaluations chosen on chosen.id = (
        select e.id from resource_evaluations e
        where e.version_id = v.id and e.rubric_version = ${rubric}
          and e.state in ('succeeded', 'partial')
          and (e.data ->> 'content_digest') = (v.data ->> 'content_digest')
          and ((e.data ->> 'scope') = 'static' or (
            e.evaluator_digest is not null
            and (e.data -> 'requires_api_key') = coalesce(r.data -> 'requires_api_key', 'false')
            and (e.data ->> 'audience_class') = case when ${isPublic} then 'public' else 'signed_in' end
          ))
        order by ((e.data ->> 'scope') = 'full') desc, e.requested_at desc, e.id desc limit 1
      ) cross join ${dimensions}`,
    filter: sql`${inArray(sql`r.id`, releaseIds)} and (dim.value ->> 'status') = 'scored'`,
    position: sqlite ? sql`dim.key` : sql`dim.position`,
  };
}

/** 只校验跨数据库边界的公开字段；最低项和显示顺序由各消费端决定。 */
export function parseEvaluationSummaries(
  rows: readonly { releaseId: string; id: unknown; score: unknown; confidence: unknown }[],
): Map<string, EvaluationSummary> {
  const summaries = new Map<string, EvaluationSummary>();
  for (const { releaseId, ...fields } of rows) {
    const { id, score, confidence } = evaluationScoredDimensionSchema.parse(fields);
    const dimension: EvaluationSummary['dimensions'][number] = {
      id,
      score,
      confidence,
      band: evaluationBand(score),
    };
    const summary = summaries.get(releaseId);
    if (summary) summary.dimensions.push(dimension);
    else summaries.set(releaseId, { dimensions: [dimension] });
  }
  return summaries;
}
