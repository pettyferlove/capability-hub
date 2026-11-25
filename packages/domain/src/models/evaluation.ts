import { z } from 'zod';
import { evaluationDimensions, evaluationThresholds, isEvaluationText } from '../evaluation.js';

const text = z.string().refine(isEvaluationText, { params: { evaluationEvidence: true } });
const id = z.string().min(1).refine(isEvaluationText);
const count = z.number().int().nonnegative();
const date = z.iso.datetime();
const digest = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const evidence = z
  .strictObject({
    path: id,
    start_line: z.int().positive(),
    end_line: z.int().positive(),
  })
  .refine((row) => row.end_line >= row.start_line);
const check = z.strictObject({
  id,
  verdict: z.enum(['pass', 'partial', 'fail', 'na']),
  evidence: z.array(evidence).max(3),
  note: text.max(300).optional(),
  suggestion: text.max(300).optional(),
  value: z.number().min(0).max(1).optional(),
});
const dimension = z
  .strictObject({
    id: z.enum(evaluationDimensions),
    status: z.enum(['scored', 'insufficient', 'not_applicable', 'failed', 'pending']),
    score: count.max(100).nullable(),
    confidence: z.enum(['high', 'medium', 'low']).nullable(),
    checks: z.array(check),
    metrics: z.record(id, z.number()).optional(),
    flags: z
      .array(
        z.enum([
          'coverage_limited',
          'script_unverified',
          'manipulation_suspected',
          'limited_uplift',
          'negative_uplift',
        ]),
      )
      .optional(),
    summary: text.max(400).optional(),
    failure_code: id.optional(),
  })
  .refine((row) => (row.status === 'scored') === (row.score !== null));
const verdictEvidence = z.strictObject({
  passed: z.boolean(),
  valid: z.boolean(),
  quote: text.max(evaluationThresholds.effectiveness.maxQuoteChars),
});

const stage = z.strictObject({
  id,
  state: z.enum(['pending', 'succeeded', 'failed', 'skipped']),
  execution_id: id.optional(),
  assertion_results: z
    .array(z.strictObject({ with_skill: verdictEvidence, without_skill: verdictEvidence }))
    .max(5)
    .optional(),
  coverage_limited: z.boolean().optional(),
  requests: count.optional(),
  finished_at: date.optional(),
  failure_code: id.optional(),
});
const triggerCase = z.strictObject({
  id,
  kind: z.enum(['should_trigger', 'near_miss']),
  language: z.enum(['zh', 'en']),
  query: text.refine((query) => {
    const length = [...query].length;
    const { minChars, maxChars } = evaluationThresholds.triggering;
    return length >= minChars && length <= maxChars;
  }),
});
const taskCase = z.strictObject({
  id,
  origin: z.enum(['author', 'generated']),
  prompt: text.max(1200),
  expected: text.max(600),
  assertions: z.array(text.max(200)).min(3).max(5),
  files: z.array(id).max(16).optional(),
  script_dependent: z.boolean().optional(),
});

/** 固定版本的业务证据随备份恢复，嵌套字段和记录大小在读写两端校验。 */
export const resourceEvaluationSchema = z
  .strictObject({
    id,
    asset_id: id,
    version_id: id,
    content_digest: digest,
    scope: z.enum(['static', 'full']),
    trigger: z.enum(['intake_ready', 'submission', 'release', 'manual', 'backfill']),
    requested_by: id.nullable(),
    priority: count,
    rubric_version: id,
    evaluator_digest: digest.nullable(),
    subject_digest: digest,
    audience_class: z.enum(['public', 'signed_in']).nullable(),
    requires_api_key: z.boolean().nullable(),
    scan_ruleset: id.nullable(),
    context: z
      .strictObject({ pool_digest: digest, distractor_release_ids: z.array(id), synthetic_set: id })
      .nullable(),
    cases: z.strictObject({ trigger: z.array(triggerCase), tasks: z.array(taskCase) }).nullable(),
    confusions: z
      .array(z.strictObject({ case_id: id, release_id: id }))
      .max(8)
      .optional(),
    stages: z.array(stage),
    dimensions: z.array(dimension),
    state: z.enum(['queued', 'running', 'succeeded', 'partial', 'failed', 'cancelled']),
    active_job_id: id.nullable(),
    reused_from: id.nullable(),
    failure_code: id.optional(),
    requested_at: date,
    started_at: date.optional(),
    finished_at: date.optional(),
    revision: z.int().positive(),
  })
  .refine((row) => Buffer.byteLength(JSON.stringify(row)) <= 128 * 1024, '评测记录超过 128 KiB');

/** 旧 SQLite 允许模型证据含 NUL 或孤立代理项。只在读出旧证据时替换非法字符，保留标识和关联。 */
export function parseStoredEvaluation(value: unknown) {
  const parsed = resourceEvaluationSchema.safeParse(value);
  if (parsed.success) return parsed.data;
  const rubric =
    value && typeof value === 'object' && 'rubric_version' in value && value.rubric_version;
  const version = typeof rubric === 'string' && /^(\d{4}-\d{2}-\d{2})\.(\d+)$/.exec(rubric);
  if (
    !version ||
    version[1] > '2026-11-24' ||
    (version[1] === '2026-11-24' && Number(version[2]) > 4) ||
    !parsed.error.issues.every(
      (issue) => issue.code === 'custom' && issue.params?.evaluationEvidence === true,
    )
  )
    throw parsed.error;
  const copy = structuredClone(value) as Record<PropertyKey, unknown>;
  for (const { path } of parsed.error.issues) {
    let parent = copy;
    for (const key of path.slice(0, -1)) parent = parent[key] as Record<PropertyKey, unknown>;
    const key = path.at(-1)!;
    parent[key] = (parent[key] as string)
      .replaceAll('\0', '\uFFFD')
      .replace(/\p{Surrogate}/gu, '\uFFFD');
  }
  return resourceEvaluationSchema.parse(copy);
}

/** 窗口按 UTC 记录毫秒时间戳，同一实例共享一条调度记录。 */
export const evaluationScheduleSchema = z.strictObject({
  id: z.literal('resource-evaluations'),
  window_start: count,
  reserved: count,
  updated_at: date,
});

/** 说明与引用仅供维护读取，公开投影只选取标准项和判定。 */
export type EvaluationCheckResult = z.infer<typeof check>;

/** 仅已评分维度携带分数，其他状态用空值保留缺失语义。 */
export type EvaluationDimensionResult = z.infer<typeof dimension>;

/** 行号从 1 开始，两端都包含在引用范围内。 */
export type EvaluationEvidence = z.infer<typeof evidence>;

/** 历史评测绑定固定版本，终态后通过新记录表达再次评测。 */
export type ResourceEvaluationRecord = z.infer<typeof resourceEvaluationSchema>;

/** 调度单例属于实例，独立于资产和目录修订。 */
export type EvaluationScheduleRecord = z.infer<typeof evaluationScheduleSchema>;
