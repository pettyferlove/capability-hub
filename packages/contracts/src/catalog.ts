import { z } from 'zod';
import { assetCategorySchema, assetKindSchema } from './primitives.js';

/** 维护列表的查询入口，页大小与共享分页控件保持一致，拒绝未知参数。 */
export const managementAssetListQuerySchema = z
  .object({
    q: z.string().trim().max(200).default(''),
    state: z.enum(['all', 'pending', 'active', 'deprecated', 'blocked']).default('all'),
    page: z
      .string()
      .regex(/^[1-9]\d{0,6}$/)
      .default('1')
      .transform(Number),
    page_size: z.enum(['5', '10', '20', '50']).default('10').transform(Number),
  })
  .strict();

/**
 * 关键词联想查询：`limit` 1–20 默认 20，`q` 去空白后 ≤128 字符，空串表示不过滤。
 * 服务端在请求入口解析，严格模式拒绝未知查询参数。
 */
export const keywordOptionsQuerySchema = z
  .object({
    q: z.string().trim().max(128).default(''),
    limit: z.coerce.number().int().min(1).max(20).default(20),
  })
  .strict();

/**
 * 目录检索查询：`limit` 1–50 默认 20，`languages`/`frameworks` 各最多 20 项。
 * `cursor` 为服务端签发的不透明游标，与 `q`、筛选条件一起决定翻页结果；严格模式拒绝未知参数。
 */
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

/**
 * 关键词建议查询：`limit` 1–20 默认 8，按类型、分类或场景收窄后再取热门与发现类关键词。
 * 严格模式拒绝未知参数，避免拼错的维度被静默忽略。
 */
export const keywordSuggestionsQuerySchema = z
  .object({
    kind: assetKindSchema.optional(),
    category: assetCategorySchema.optional(),
    scenario_id: z.uuid().optional(),
    limit: z.coerce.number().int().min(1).max(20).default(8),
  })
  .strict();
