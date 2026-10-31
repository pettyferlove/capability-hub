import { z } from 'zod';
import { uuidSchema } from './primitives.js';

export const feedbackKinds = {
  defect: '缺陷',
  capability_gap: '能力缺口',
  suggestion: '改进建议',
} as const;
export const feedbackStatuses = {
  pending: '待处理',
  in_progress: '处理中',
  resolved: '已解决',
  declined: '不采纳',
} as const;
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
export const assetFeedbackQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).max(100000).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(10),
    status: z.enum(['pending', 'in_progress', 'resolved', 'declined']).optional(),
  })
  .strict();
export type AssetFeedbackRequest = z.input<typeof assetFeedbackRequestSchema>;
export type AssetFeedbackUpdateRequest = z.input<typeof assetFeedbackUpdateRequestSchema>;
