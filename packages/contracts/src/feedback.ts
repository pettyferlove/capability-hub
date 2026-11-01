import { z } from 'zod';
import { uuidSchema } from './primitives.js';

/** 反馈类型字典：键为线协议取值，值为界面文案；新增类型需同步 {@link assetFeedbackRequestSchema}。 */
export const feedbackKinds = {
  defect: '缺陷',
  capability_gap: '能力缺口',
  suggestion: '改进建议',
} as const;

/** 反馈状态字典；`resolved` 与 `declined` 视为处理结束，更新时必须填写处理说明。 */
export const feedbackStatuses = {
  pending: '待处理',
  in_progress: '处理中',
  resolved: '已解决',
  declined: '不采纳',
} as const;

/**
 * 提交反馈：按固定版本记录，`idempotency_key`（去空白后 1–200 字符）由调用方生成，
 * 同键同内容重复提交返回既有记录，同键不同内容返回冲突；`consent` 必须显式为 `true`。
 * 正文各字段长度 1–2000/4000 字符；提交入口另有每小时 20 条的上限。
 */
export const assetFeedbackRequestSchema = z
  .object({
    version_id: uuidSchema,
    idempotency_key: z.string().trim().min(1).max(200),
    kind: z.enum(['defect', 'capability_gap', 'suggestion']),
    title: z.string().trim().min(1).max(160),
    scenario: z.string().trim().min(1).max(2000),
    expected: z.string().trim().min(1).max(2000),
    actual: z.string().trim().min(1).max(2000),
    location: z.string().trim().max(240).default(''),
    reproduction: z.string().trim().max(4000).default(''),
    evidence: z.string().trim().max(4000).default(''),
    suggestion: z.string().trim().max(2000).default(''),
    blocking: z.boolean().default(false),
    consent: z.literal(true),
  })
  .strict();

/**
 * 处理反馈：`revision` 为乐观锁版本，与库中不一致时返回冲突；状态改为 `resolved`/`declined`
 * 时处理说明不得为空。`fixed_version_id` 可显式置 `null` 表示撤销修复版本关联。
 */
export const assetFeedbackUpdateRequestSchema = z
  .object({
    revision: z.number().int().positive(),
    status: z.enum(['pending', 'in_progress', 'resolved', 'declined']),
    resolution: z.string().trim().max(2000),
    fixed_version_id: uuidSchema.nullable(),
  })
  .strict()
  .refine(
    (value) => !['resolved', 'declined'].includes(value.status) || value.resolution.length > 0,
    { message: '结束处理时请填写处理说明' },
  );

/** 反馈列表查询：`page` 1–100000 默认 1，`limit` 1–50 默认 10；省略 `status` 表示全部状态。 */
export const assetFeedbackQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).max(100000).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(10),
    status: z.enum(['pending', 'in_progress', 'resolved', 'declined']).optional(),
  })
  .strict();

/** {@link assetFeedbackRequestSchema} 的输入侧类型：可省略带默认值的字段，`consent` 仍需为 `true`。 */
export type AssetFeedbackRequest = z.input<typeof assetFeedbackRequestSchema>;

/** {@link assetFeedbackUpdateRequestSchema} 的输入侧类型。 */
export type AssetFeedbackUpdateRequest = z.input<typeof assetFeedbackUpdateRequestSchema>;
