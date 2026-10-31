import type { Principal } from '@capability-hub/domain/identity';
import type { SessionRecord, TokenRecord } from '@capability-hub/domain/models';
declare global {
  namespace Express {
    interface Locals {
      request_id: string;
      principal: Principal;
      viewer?: Principal | null;
      session?: SessionRecord;
      token?: Pick<TokenRecord, 'scope' | 'user_id'>;
      identity_refresh_failed?: boolean;
    }
  }
}
export {};
