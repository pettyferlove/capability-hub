import { z } from 'zod';

const epoch = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);

/**
 * 个人访问令牌记录。`id` 存的是令牌明文（32 字节随机数，base64url）的 SHA-256 十六进制摘要，
 * 明文只在签发响应里出现一次、不落库，因此鉴权就是拿摘要查表。
 * `created_at` 与 `revoked_at` 均为 epoch 毫秒；`revoked_at` 一旦置位即永久失效，不会被复原。
 * `hub:contribute` 覆盖写入能力，`hub:read` 只能读。记录不符合本 schema 时按记录损坏处理，交给调用方拒绝。
 */
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
