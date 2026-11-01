import type { BlobStorage } from '../ports/index.js';
import type { RecordStore } from '../ports/index.js';
import type { IdentityService } from '../identity/identity-service.js';

/** 仅包含共享的存储、内容与身份能力，业务协作者单独注入。 */
export interface ApplicationContext {
  readonly store: RecordStore;
  readonly blobs: BlobStorage;
  readonly identity: IdentityService;
}
