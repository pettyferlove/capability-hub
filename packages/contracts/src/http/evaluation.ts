import { z } from 'zod';

const id = z.string().min(1);
const count = z.int().nonnegative();
const date = z.iso.datetime();
const digest = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const dimensionId = z.enum([
  'structure',
  'triggering',
  'instructions',
  'effectiveness',
  'transparency',
]);
const check = z.strictObject({ id, label: id, verdict: z.enum(['pass', 'partial', 'fail', 'na']) });
const publicDimension = z.strictObject({
  id: dimensionId,
  label: id,
  status: z.enum(['scored', 'insufficient', 'not_applicable', 'failed', 'pending']),
  score: count.max(100).nullable(),
  band: z.enum(['excellent', 'good', 'fair', 'weak']).nullable(),
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
});
const evaluation = z.strictObject({
  id,
  version_id: id,
  version_label: id,
  rubric_version: id,
  scan_ruleset: id.nullable(),
  comparable_key: digest,
  state: z.enum(['queued', 'running', 'succeeded', 'partial', 'failed', 'cancelled']),
  evaluated_at: date.nullable(),
  dimensions: z.array(publicDimension),
  limitations: z.array(
    z.enum(['static_only', 'scripts_not_executed', 'paper_run_only', 'client_routing_may_differ']),
  ),
});

/** 公开响应仅含固定词汇与数值，缺少可展示评测时保留空值。 */
export const evaluationResponseSchema = z.strictObject({
  current_rubric_version: id,
  updating: z.boolean(),
  latest_attempt_id: id.optional(),
  next_window_at: date.optional(),
  comparison_status: z.enum(['none', 'available', 'incomparable']),
  can_view_details: z.boolean(),
  can_request: z.boolean(),
  evaluation: evaluation.nullable(),
  baseline: z
    .strictObject({
      version_label: id,
      dimensions: z.array(z.strictObject({ id: dimensionId, score: count.max(100).nullable() })),
    })
    .nullable(),
});
const evidence = z.strictObject({
  path: id,
  start_line: z.int().positive(),
  end_line: z.int().positive(),
});
const detailedCheck = check.extend({
  evidence: z.array(evidence).max(3),
  note: z.string().max(300).optional(),
  suggestion: z.string().max(300).optional(),
  value: z.number().min(0).max(1).optional(),
  weight: z.number().nonnegative().optional(),
});
const detailedDimension = publicDimension.extend({
  checks: z.array(detailedCheck),
  summary: z.string().max(400).optional(),
  failure_code: id.optional(),
});
const verdictEvidence = z.strictObject({
  passed: z.boolean(),
  valid: z.boolean(),
  quote: z.string().max(320),
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
const managementEvaluation = evaluation.extend({
  asset_id: id,
  content_digest: digest,
  scope: z.enum(['static', 'full']),
  trigger: z.enum(['intake_ready', 'submission', 'release', 'manual', 'backfill']),
  requested_by: id.nullable(),
  priority: count,
  evaluator_digest: digest.nullable(),
  subject_digest: digest,
  audience_class: z.enum(['public', 'signed_in']).nullable(),
  requires_api_key: z.boolean().nullable(),
  context: z
    .strictObject({ pool_digest: digest, distractor_release_ids: z.array(id), synthetic_set: id })
    .nullable(),
  cases: z
    .strictObject({
      trigger: z.array(
        z.strictObject({
          id,
          kind: z.enum(['should_trigger', 'near_miss']),
          language: z.enum(['zh', 'en']),
          query: z.string().refine((value) => {
            const length = Array.from(value).length;
            return length >= 8 && length <= 300;
          }),
        }),
      ),
      tasks: z.array(
        z.strictObject({
          id,
          origin: z.enum(['author', 'generated']),
          prompt: z.string().max(1200),
          expected: z.string().max(600),
          assertions: z.array(z.string().max(200)).min(3).max(5),
          files: z.array(id).max(16).optional(),
          script_dependent: z.boolean().optional(),
        }),
      ),
    })
    .nullable(),
  confusions: z
    .array(z.strictObject({ case_id: id, name: id }))
    .max(8)
    .optional(),
  stages: z.array(stage),
  dimensions: z.array(detailedDimension),
  active_job_id: id.nullable(),
  reused_from: id.nullable(),
  failure_code: id.optional(),
  requested_at: date,
  started_at: date.optional(),
  finished_at: date.optional(),
  revision: z.int().positive(),
});

/** 审核页按指定申请的冻结声明登记；轻量回执随幂等键重放。 */
export const requestEvaluationSchema = z.strictObject({ publication_request_id: id.optional() });

/** 回执标识固定版本及是否复用，详细证据由受权历史接口读取。 */
export const requestEvaluationResponseSchema = z.strictObject({
  evaluation: managementEvaluation.pick({
    id: true,
    version_id: true,
    scope: true,
    state: true,
    reused_from: true,
  }),
  reused: z.boolean(),
});

const managementState = {
  current_rubric_version: id,
  model_enabled: z.boolean(),
  can_request: z.boolean(),
  next_window_at: date.nullable(),
};

/** 维护历史保留阶段进度、失败原因与逐项证据。 */
export const managementEvaluationsResponseSchema = z.strictObject({
  ...managementState,
  items: z.array(managementEvaluation),
});

/** 基线与当前结果分别表达缺失，调用方无需补零。 */
export type EvaluationResponse = z.infer<typeof evaluationResponseSchema>;

/** 卡片只交付现行标准下有读数的维度，不含检查项、模型文字或跨版本基线。 */
export interface EvaluationSummaryResponse {
  dimensions: (Pick<z.infer<typeof publicDimension>, 'id' | 'band' | 'confidence'> & {
    score: number;
  })[];
}

/** 每个历史条目保留自身标准版本和修订号。 */
export type ManagementEvaluationsResponse = z.infer<typeof managementEvaluationsResponseSchema>;

/** 对应申请的审核视图；回归值为两次可比分数之差。 */
export const reviewEvaluationResponseSchema = z.strictObject({
  ...managementState,
  candidate: managementEvaluation.nullable(),
  current: managementEvaluation.nullable(),
  regressions: z.array(
    z.strictObject({
      id: dimensionId,
      label: id,
      previous: count.max(100),
      score: count.max(100),
      drop: count.max(100),
    }),
  ),
});

/** 审核面板与固定版本基线使用同一套维度和分级。 */
export type ReviewEvaluationResponse = z.infer<typeof reviewEvaluationResponseSchema>;
