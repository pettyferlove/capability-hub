export { openRecordStore, type RecordStoreOptions } from './persistence/record-store.js';
export {
  snapshotStore,
  restoreStore,
  type StoreSnapshot,
} from './persistence/backup/store-snapshot.js';
export { parseSnapshot, blobReferences } from './persistence/backup/snapshot-validation.js';
