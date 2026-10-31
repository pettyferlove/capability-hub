import { z } from 'zod';
import { keywordsSchema, assetKindSchema, assetSlugSchema, uuidSchema } from './primitives.js';
import { versionLabelPattern, isFixedVersionLabel } from './version-labels.js';
const versionLabel = z
  .string()
  .min(1)
  .max(128)
  .regex(versionLabelPattern)
  .refine(isFixedVersionLabel, '版本号超出支持范围');
export const intakeStatuses = [
  'processing',
  'ready',
  'pending',
  'approved',
  'failed',
  'rejected',
  'stale',
  'cancelled',
  'deprecated',
  'blocked',
] as const;
export type IntakeStatus = (typeof intakeStatuses)[number];
export const intakeListQuerySchema = z
  .object({
    page: z
      .string()
      .regex(/^[1-9]\d{0,6}$/)
      .default('1')
      .transform(Number),
    page_size: z.enum(['5', '10', '20', '50']).default('5').transform(Number),
    q: z.string().trim().max(200).default(''),
    state: z.enum(['all', ...intakeStatuses]).default('all'),
  })
  .strict();

export const uploadIntakeRequestSchema = z.discriminatedUnion('target', [
  z
    .object({
      target: z.literal('new'),
      owner_group_id: uuidSchema,
      slug: assetSlugSchema,
      kind: assetKindSchema,
      keywords: keywordsSchema.optional(),
      requires_api_key: z.boolean().optional(),
      version_label: versionLabel,
    })
    .strict(),
  z
    .object({
      target: z.literal('existing'),
      asset_id: uuidSchema,
      keywords: keywordsSchema.optional(),
      requires_api_key: z.boolean().optional(),
      version_label: versionLabel,
      version_mode: z.enum(['automatic', 'manual']).default('manual'),
    })
    .strict(),
]);

export type IntakeState = 'received' | 'fetching' | 'scanning' | 'ready' | 'failed' | 'cancelled';

export type UploadIntakeRequest = z.input<typeof uploadIntakeRequestSchema>;

export const intakeProgressResponseSchema = z.strictObject({
  id: uuidSchema,
  state: z.enum(['received', 'fetching', 'scanning', 'ready', 'failed', 'cancelled']),
  phase: z.string(),
  progress: z
    .array(
      z.strictObject({
        step: z.enum(['received', 'fetching', 'scanning', 'snapshot']),
        started_at: z.iso.datetime(),
      }),
    )
    .min(1),
  finished_at: z.iso.datetime().nullable(),
  error_code: z.string().nullable(),
  error_message: z.string().nullable(),
});
export type IntakeProgressResponse = z.infer<typeof intakeProgressResponseSchema>;
