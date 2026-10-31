import type { Applicability } from '../content.js';
import type { Policy } from '../policy.js';
import type { EpochMilliseconds, IsoDateTime, VersionedRecord } from './base.js';

interface SourceBase extends VersionedRecord {
  owner_group_id: string;
  state: 'active' | 'paused' | 'blocked' | 'auth_error';
  generation: number;
  created_at: IsoDateTime;
  distribution_revoked_at?: IsoDateTime;
}

export interface UploadSourceRecord extends SourceBase {
  kind: 'upload';
}

export interface GitSourceRecord extends SourceBase {
  kind: 'git';
  provider: string;
  canonical_url: string;
  repository_identity: string;
  branch: string;
  credential_ref: string | null;
  next_poll_at: EpochMilliseconds;
  last_success_at?: IsoDateTime;
  last_error_code?: string | null;
  last_observed_commit?: string;
  last_observed_revision?: number;
}

export type SourceRecord = UploadSourceRecord | GitSourceRecord;

export interface BindingRecord extends Policy {
  id: string;
  source_id: string;
  asset_id: string;
  path: string;
  enabled: boolean;
  retired_at: IsoDateTime | null;
  applies_to: Applicability;
  created_at: IsoDateTime;
  last_intake_id?: string;
}

export interface EncryptedCredential {
  iv: string;
  tag: string;
  data: string;
}

export interface GitCredentialRecord extends VersionedRecord {
  user_id: string;
  name: string;
  host: string;
  kind: 'token' | 'ssh';
  username: string;
  auth_method: 'basic' | 'bearer';
  host_key: string;
  fingerprint: string | null;
  host_fingerprint: string | null;
  expires_at: IsoDateTime | null;
  created_at: IsoDateTime;
  updated_at: IsoDateTime;
  revoked_at: IsoDateTime | null;
  encrypted: EncryptedCredential | null;
}
