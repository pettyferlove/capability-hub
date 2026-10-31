import { z } from 'zod';
import { distributionPolicySchema } from './policy.js';
import {
  applicabilitySchema,
  assetCategorySchema,
  assetKindSchema,
  assetSlugSchema,
  uuidSchema,
} from './primitives.js';
export const sourceTargetSchema = z
  .object({
    slug: assetSlugSchema,
    kind: assetKindSchema,
    path: z.string().min(1).max(240),
    category: assetCategorySchema,
    scenario_ids: z.array(uuidSchema),
    distribution: distributionPolicySchema,
    applies_to: applicabilitySchema.optional(),
  })
  .strict();
export const createSourceRequestSchema = z
  .object({
    repository_url: z
      .string()
      .max(2048)
      .refine(
        (v) => /^(?:https:\/\/|ssh:\/\/|[a-zA-Z0-9_.-]+@[^/:]+:)/.test(v),
        '请使用 HTTPS 或 SSH 仓库地址',
      ),
    provider: z.literal('generic-git'),
    branch: z.string().min(1).max(255),
    credential_ref: uuidSchema.optional(),
    owner_group_id: uuidSchema,
    targets: z.array(sourceTargetSchema).min(1).max(50),
  })
  .strict();
export const updateSourceRequestSchema = z
  .object({
    branch: z.string().min(1).max(255).optional(),
    credential_ref: uuidSchema.nullable().optional(),
    state: z.enum(['active', 'paused']).optional(),
    targets: z
      .array(
        sourceTargetSchema.extend({
          binding_id: uuidSchema.optional(),
          asset_id: uuidSchema.optional(),
          enabled: z.boolean().optional(),
        }),
      )
      .min(1)
      .max(50)
      .optional(),
  })
  .strict();

export type CreateSourceRequest = z.input<typeof createSourceRequestSchema>;
export type UpdateSourceRequest = z.input<typeof updateSourceRequestSchema>;
