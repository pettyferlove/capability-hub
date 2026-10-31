import type { EpochMilliseconds } from './base.js';

export interface IdempotencyRecord {
  id: string;
  principal_id: string;
  route: string;
  key: string;
  request_hash: string;
  response: unknown;
  expires_at: EpochMilliseconds;
}
