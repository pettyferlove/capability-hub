import { z } from 'zod';
import { uuidSchema } from './primitives.js';

export const nominateAssetRequestSchema = z
  .object({
    release_id: uuidSchema,
    reason: z.string().trim().min(10, '请至少用 10 个字说明通用价值').max(2000),
  })
  .strict();

export const assetRecommendationRequestSchema = z
  .object({
    version_id: uuidSchema,
    recommended: z.boolean(),
  })
  .strict();

export type NominateAssetRequest = z.input<typeof nominateAssetRequestSchema>;
export type AssetRecommendationRequest = z.input<typeof assetRecommendationRequestSchema>;
