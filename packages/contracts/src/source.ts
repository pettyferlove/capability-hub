import { z } from 'zod';
import { distributionPolicySchema } from './policy.js';
import {
  applicabilitySchema,
  assetCategorySchema,
  assetKindSchema,
  assetSlugSchema,
  uuidSchema,
} from './primitives.js';

/**
 * 来源内的一个绑定目标：仓库相对路径 ↔ 资源，携带发布策略与适用范围。
 * 严格模式拒绝未知字段，避免拼错的字段在同步时被静默忽略。
 */
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

/**
 * 登记 Git 来源：`repository_url`（≤2048 字符）只接受 HTTPS、`ssh://` 或 `user@host:path` 形式，
 * 避免把本地路径或畸形地址写进配置。`provider` 目前只有 `generic-git`，绑定目标 1–50 个。
 */
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

/**
 * 更新来源：字段全部可选，未提供的保持原值；`credential_ref` 置 `null` 表示解除凭据绑定。
 * `targets` 一旦提供即为全量集合，必须覆盖所有现有目标：已有绑定按 `binding_id` 就地更新，
 * 其 `slug`/`kind`/`asset_id` 不可改，新增目标也不得认领已有资产。
 */
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

/** {@link createSourceRequestSchema} 的输入侧类型，绑定目标此时仍是请求原样字段。 */
export type CreateSourceRequest = z.input<typeof createSourceRequestSchema>;

/** {@link updateSourceRequestSchema} 的输入侧类型；所有字段可省略表示部分更新。 */
export type UpdateSourceRequest = z.input<typeof updateSourceRequestSchema>;
