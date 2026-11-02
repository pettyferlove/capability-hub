import { z } from 'zod';
import { uuidSchema } from './primitives.js';

/** 提名理由按去掉首尾空白后的 UTF-16 码元数计长。 */
export const nominationReasonLength = { min: 10, max: 2000 } as const;

/**
 * 提名请求：`release_id` 指向已发布版本，理由去空白后需 10–2000 字，用于说明通用价值。
 * 服务端在请求入口解析；严格模式拒绝未知字段。
 */
export const nominateAssetRequestSchema = z
  .object({
    release_id: uuidSchema,
    reason: z
      .string()
      .trim()
      .min(nominationReasonLength.min, `请至少用 ${nominationReasonLength.min} 个字说明通用价值`)
      .max(nominationReasonLength.max),
  })
  .strict();

/**
 * 推荐请求按资源记录目标状态，重复提交同一取值结果一致，无需额外幂等键。
 */
export const assetRecommendationRequestSchema = z
  .object({
    asset_id: uuidSchema,
    recommended: z.boolean(),
  })
  .strict();

/** {@link nominateAssetRequestSchema} 的输入侧类型，即解析前的原始请求体。 */
export type NominateAssetRequest = z.input<typeof nominateAssetRequestSchema>;

/** {@link assetRecommendationRequestSchema} 的输入侧类型。 */
export type AssetRecommendationRequest = z.input<typeof assetRecommendationRequestSchema>;
