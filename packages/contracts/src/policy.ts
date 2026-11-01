import { z } from 'zod';
import { assetCategorySchema, uuidSchema } from './primitives.js';

/**
 * 分发策略：只支持 `approved_audience`，受众 1–100 项且不得重复。
 * `public` 与 `organization` 表示向所有人或全部登录用户开放，因此必须独占数组，不能与他人受众混用。
 */
export const distributionPolicySchema = z
  .object({
    mode: z.literal('approved_audience'),
    audience: z
      .array(z.string().regex(/^(public|organization|(group|principal):[0-9a-f-]{36})$/))
      .min(1)
      .max(100),
  })
  .strict()
  .superRefine((v, c) => {
    if (
      new Set(v.audience).size !== v.audience.length ||
      (v.audience.some((id) => id === 'public' || id === 'organization') && v.audience.length !== 1)
    )
      c.addIssue({ code: 'custom', message: '受众重复，或公开、全部登录用户与其他受众混用' });
  });

/**
 * 发布策略：分类与场景列表必须一致——`scenario` 至少一个场景，其余分类场景列表为空，且场景不得重复。
 * 场景上限 20；策略变化会改变审批摘要（`policy_digest`），因此审核端按原摘要校验。
 */
export const publicationPolicySchema = z
  .object({
    category: assetCategorySchema,
    scenario_ids: z.array(uuidSchema).max(20),
    distribution: distributionPolicySchema,
  })
  .strict()
  .superRefine((v, c) => {
    if (
      (v.category === 'scenario') !== !!v.scenario_ids.length ||
      new Set(v.scenario_ids).size !== v.scenario_ids.length
    )
      c.addIssue({ code: 'custom', message: '场景分类需要至少一个场景，其他分类必须为空' });
  });

/** {@link publicationPolicySchema} 解析后的输出侧类型，已是归一化后的策略结构。 */
export type Policy = z.infer<typeof publicationPolicySchema>;
