import { z } from 'zod';
import { assetCategorySchema, uuidSchema } from './primitives.js';
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
export type Policy = z.infer<typeof publicationPolicySchema>;
