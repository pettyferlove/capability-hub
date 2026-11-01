import { z } from 'zod';
import { distributionPolicySchema } from './policy.js';
import {
  applicabilitySchema,
  assetCategorySchema,
  keywordsSchema,
  uuidSchema,
} from './primitives.js';

/**
 * 提交发布申请：`base_release_id` 记录提交时刻的当前发布版本，审核前若已变化则拒绝（409）；
 * 申请要求导入已通过扫描，`purpose` 1–2000 字符用于说明用途。内嵌策略与适用范围会一并冻结成摘要。
 */
export const submitPublicationRequestSchema = z
  .object({
    source_intake_id: uuidSchema,
    version_id: uuidSchema,
    category: assetCategorySchema,
    scenario_ids: z.array(uuidSchema),
    distribution: distributionPolicySchema,
    applies_to: applicabilitySchema,
    requires_api_key: z.boolean().optional(),
    purpose: z.string().trim().min(1).max(2000),
    base_release_id: uuidSchema.nullable(),
  })
  .strict();

/**
 * 审核决策：`policy_digest` 由客户端原样回传读取申请时拿到的值，不一致说明策略已变（409）；
 * 并发保护另由 `If-Match` 修订号承担（缺失 428、不符 412），并用幂等键防重复发版。
 * `accepted_warnings` 须与本次扫描的 warning 一一对应且各附理由，否则 422；条数上限须不小于
 * 扫描可能产生的 warning 数（1000 条提示加一条 `SCAN_TRUNCATED`）。
 */
export const publicationDecisionRequestSchema = z
  .object({
    decision: z.enum(['approve', 'reject']),
    comment: z.string().trim().max(4000),
    policy_digest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    accepted_warnings: z
      .array(
        z.object({ finding_id: z.string(), reason: z.string().trim().min(1).max(2000) }).strict(),
      )
      .max(1001)
      .default([]),
  })
  .strict();

/**
 * 提交时冻结的来源授权快照，出现在发布申请与已发布版本上。
 * 授权被撤销后申请随之失效，因此审核前会重新核对该快照。
 */
export interface SourceConsent {
  /** 授予分享权限的账号，提名场景下同时是内容来源方。 */
  actor_id: string;
  /** 授权确认时间（ISO 8601）。 */
  confirmed_at: string;
  /** 授权依据，如组织内授权或来源方同意。 */
  permission_basis: string;
  purpose: string;
  /** 授权时冻结的内容摘要，与 `content_digest` 对应。 */
  content_digest: string;
  /** 允许披露的受众范围，与发布策略的 `distribution.audience` 一致。 */
  audience: string[];
}

/** {@link submitPublicationRequestSchema} 的输入侧类型。 */
export type SubmitPublicationRequest = z.input<typeof submitPublicationRequestSchema>;

/** {@link publicationDecisionRequestSchema} 的输入侧类型，`accepted_warnings` 可省略。 */
export type PublicationDecisionRequest = z.input<typeof publicationDecisionRequestSchema>;

/**
 * 发布策略建议（供界面预填）：关键词不得为空，且场景列表与分类一致——
 * `scenario` 至少一个场景，其余分类必须为空。
 */
export const publicationSuggestionSchema = z
  .object({
    category: assetCategorySchema,
    scenario_ids: z.array(uuidSchema).max(20),
    keywords: keywordsSchema,
    purpose: z.string().trim().min(1).max(2000),
  })
  .strict()
  .refine(
    (value) =>
      value.keywords.length > 0 &&
      (value.category === 'scenario') === value.scenario_ids.length > 0,
  );

/** {@link publicationSuggestionSchema} 的输出侧类型。 */
export type PublicationSuggestion = z.infer<typeof publicationSuggestionSchema>;
