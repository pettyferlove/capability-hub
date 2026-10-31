import { z } from 'zod';
import { distributionPolicySchema } from './policy.js';
import { applicabilitySchema, assetCategorySchema, uuidSchema } from './primitives.js';
export const submitPublicationRequestSchema = z
  .object({
    source_intake_id: uuidSchema,
    version_id: uuidSchema,
    category: assetCategorySchema,
    scenario_ids: z.array(uuidSchema),
    distribution: distributionPolicySchema,
    applies_to: applicabilitySchema,
    purpose: z.string().trim().min(1).max(2000),
    base_release_id: uuidSchema.nullable(),
  })
  .strict();
export const publicationDecisionRequestSchema = z
  .object({
    decision: z.enum(['approve', 'reject']),
    comment: z.string().trim().max(4000),
    policy_digest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    accepted_warnings: z
      .array(
        z.object({ finding_id: z.string(), reason: z.string().trim().min(1).max(2000) }).strict(),
      )
      .max(100)
      .default([]),
  })
  .strict();

export interface SourceConsent {
  actor_id: string;
  confirmed_at: string;
  permission_basis: string;
  purpose: string;
  content_digest: string;
  audience: string[];
}

export type SubmitPublicationRequest = z.input<typeof submitPublicationRequestSchema>;
export type PublicationDecisionRequest = z.input<typeof publicationDecisionRequestSchema>;
