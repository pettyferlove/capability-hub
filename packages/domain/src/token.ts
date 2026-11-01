import { z } from 'zod';

const epoch = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
export const tokenRecordSchema = z
  .object({
    id: z.string().regex(/^[a-f0-9]{64}$/),
    user_id: z.uuid(),
    name: z.string().min(1).max(80),
    created_at: epoch,
    revoked_at: epoch.nullable(),
    scope: z.enum(['hub:read', 'hub:contribute']),
  })
  .strict();
