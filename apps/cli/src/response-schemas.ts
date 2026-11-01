import { z } from 'zod';
import { assetSlugSchema, manifestSchema } from '@capability-hub/contracts';

const id = z.uuid();
const text = z.string();
const digest = text.regex(/^sha256:[a-f0-9]{64}$/);
const option = z.looseObject({ option_id: text, supported: z.boolean() });
export const assetSchema = z.looseObject({
  asset_id: id,
  slug: assetSlugSchema,
  kind: z.enum(['skill', 'mcp']),
  description: text,
  current_release: z.looseObject({ version_id: id, version_label: text }),
  installation_options: z.array(option),
});
export const searchSchema = z.looseObject({
  items: z.array(assetSchema),
  total: z.number().int().nonnegative(),
});
export const versionsSchema = z.array(z.looseObject({ version_id: id, version_label: text }));
export const optionsSchema = z.object({ installation_options: z.array(option) });
export const configurationSchema = z.object({
  text,
  target_file: text,
  notes: z.array(text),
  required_variables: z.array(z.object({ instruction: text })),
});
export const manifestResponseSchema = z.object({
  manifest: manifestSchema,
  content_digest: digest,
  artifact_digest: digest,
  release_id: id.nullable(),
});
export const loginResponseSchema = z.object({
  verification_uri: z.url(),
  user_code: text.regex(/^[A-F0-9]{8}$/),
  device_code: text.regex(/^[A-Za-z0-9_-]{43}$/),
  expires_in: z.number().int().positive().max(600),
});
export const pollResponseSchema = z.discriminatedUnion('state', [
  z.object({ state: z.literal('pending') }),
  z.object({ state: z.literal('complete'), token: text.regex(/^\S+$/) }),
]);
