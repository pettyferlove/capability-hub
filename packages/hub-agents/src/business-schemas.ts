import { z } from 'zod';

export const businessInput = z
  .object({
    version_id: z.string().uuid(),
    feedback_id: z.string().uuid().optional(),
  })
  .strict();
export const evidenceSchema = z
  .object({
    path: z.string().min(1).max(500),
    start_line: z.number().int().positive(),
    end_line: z.number().int().positive(),
  })
  .strict();
export const assessmentSchema = z
  .object({
    summary: z.string().min(1).max(4000),
    risk: z.enum(['low', 'medium', 'high', 'unknown']),
    findings: z
      .array(
        z
          .object({
            title: z.string().min(1).max(200),
            severity: z.enum(['info', 'warning', 'critical']),
            explanation: z.string().min(1).max(2000),
            recommendation: z.string().min(1).max(2000),
            evidence: z.array(evidenceSchema).max(10),
          })
          .strict(),
      )
      .max(30),
    limitations: z.array(z.string().min(1).max(1000)).max(30),
    suggested_resolution: z.string().min(1).max(1800),
  })
  .strict();
export const businessDecision = z
  .object({
    approved: z.boolean().describe('采纳本次研判'),
    comment: z.string().trim().max(2000).default('').describe('人工意见'),
    apply_feedback: z
      .boolean()
      .default(false)
      .describe('将反馈标记为处理中并写入建议（需要维护权限）'),
  })
  .strict();
export const researchSchema = z
  .object({
    ...businessInput.shape,
    can_apply_feedback: z.boolean(),
    feedback_revision: z.number().int().positive().nullable(),
    content_digest: z.string(),
    assessment: assessmentSchema,
    inspected: z.array(evidenceSchema),
  })
  .strict();
export const businessResult = researchSchema
  .extend({
    approved: z.boolean(),
    comment: z.string(),
    feedback_applied: z.boolean(),
    artifact_id: z.string(),
  })
  .strict();
