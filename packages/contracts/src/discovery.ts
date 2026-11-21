import { z } from 'zod';
import { assetCategorySchema, assetKindSchema } from './primitives.js';

function phrase(max: number) {
  return z
    .string()
    .transform((value) => value.normalize('NFKC').trim().replace(/\s+/g, ' '))
    .pipe(z.string().min(1).max(max));
}

function unique(values: string[]) {
  const seen = new Map<string, string>();
  for (const value of values)
    if (!seen.has(value.toLowerCase())) seen.set(value.toLowerCase(), value);
  return [...seen.values()];
}

/** 首页对话的模式：配置了默认模型为 `dialogue`，否则为关键词匹配。 */
const discoveryModeSchema = z.enum(['dialogue', 'keywords']);

/**
 * 发现条件；`null` 表示不限。召回词只扩展候选，必需项必须由固定版本的发布信息证实；
 * `sort` 只由用户更改。
 */
export const discoveryCriteriaSchema = z.strictObject({
  keywords: z.array(phrase(64)).max(5).transform(unique),
  requirements: z.array(phrase(64)).max(5).transform(unique),
  kind: assetKindSchema.nullable(),
  category: assetCategorySchema.nullable(),
  scenario_id: z.uuid().nullable(),
  audience: z.enum(['readable', 'public', 'restricted']),
  has_scripts: z.boolean().nullable(),
  sort: z.enum(['relevance', 'recent']),
});

/** 已归一化的发现条件。 */
export type DiscoveryCriteria = z.infer<typeof discoveryCriteriaSchema>;

/** 签名上下文仅含 ASCII，签发与回传共用同一字节上限。 */
export const discoveryContextMaxBytes = 16 * 1024;
const viewerKey = z.string().min(1).max(128);
const context = z.string().min(1).max(discoveryContextMaxBytes);

/**
 * 首页一轮：`message` 是用户显式发言；`filter` 只按改过的条件查目录、`direction` 按序号展开上一轮的方向，
 * 两者都不请求模型。`viewer_key` 与 `expected_mode` 取自开始编辑时的入口状态；`context` 原样回传上一轮签名。
 */
export const discoveryTurnRequestSchema = z
  .discriminatedUnion('action', [
    z.strictObject({
      action: z.literal('message'),
      expected_mode: discoveryModeSchema,
      viewer_key: viewerKey,
      text: z
        .string()
        .transform((value) => value.trim())
        .pipe(z.string().min(1).max(500)),
      suggestion_ref: z.uuid().optional(),
      context: context.optional(),
    }),
    z.strictObject({
      action: z.literal('filter'),
      expected_mode: z.literal('dialogue'),
      viewer_key: viewerKey,
      criteria: discoveryCriteriaSchema,
      context,
    }),
    z.strictObject({
      action: z.literal('direction'),
      expected_mode: z.literal('dialogue'),
      viewer_key: viewerKey,
      index: z.number().int().min(1).max(3),
      context,
    }),
  ])
  .refine((request) => request.expected_mode !== 'keywords' || request.context === undefined, {
    message: '关键词模式不接受对话上下文',
    path: ['context'],
  });

/** SSE 进度帧只带数量和阶段；引用号、资源名称与回应正文在授权和依据复核后才随结果返回。 */
export const discoveryStageEventSchema = z.discriminatedUnion('stage', [
  z.strictObject({
    stage: z.literal('catalog'),
    resources: z.int().nonnegative(),
    complete: z.boolean(),
  }),
  z.strictObject({ stage: z.literal('writing'), characters: z.int().min(1).max(240) }),
  z.strictObject({ stage: z.literal('verify') }),
]);

/** 终态结果和错误不属于进度帧。 */
export type DiscoveryStageEvent = z.infer<typeof discoveryStageEventSchema>;
