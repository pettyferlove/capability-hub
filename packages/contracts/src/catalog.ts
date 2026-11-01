import { z } from 'zod';
import { assetCategorySchema, assetKindSchema } from './primitives.js';
export const keywordOptionsQuerySchema = z
  .object({
    q: z.string().trim().max(128).default(''),
    limit: z.coerce.number().int().min(1).max(20).default(20),
  })
  .strict();
export const catalogSearchQuerySchema = z
  .object({
    q: z.string().max(500).default(''),
    kind: assetKindSchema.optional(),
    category: assetCategorySchema.optional(),
    scenario_id: z.string().optional(),
    cursor: z.string().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
    languages: z.array(z.string().max(128)).max(20).optional(),
    frameworks: z.array(z.string().max(128)).max(20).optional(),
  })
  .strict();
export const keywordSuggestionsQuerySchema = z
  .object({
    kind: assetKindSchema.optional(),
    category: assetCategorySchema.optional(),
    scenario_id: z.uuid().optional(),
    limit: z.coerce.number().int().min(1).max(20).default(8),
  })
  .strict();
