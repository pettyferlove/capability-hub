import type { Applicability } from '../content.js';
import type { Policy } from '../policy.js';
import type { IntakeState } from '../intake.js';

export interface GitCredentialResponse {
  id: string;
  revision: number;
  user_id: string;
  name: string;
  host: string;
  kind: 'token' | 'ssh';
  username: string;
  auth_method: 'basic' | 'bearer';
  host_key: string;
  fingerprint: string | null;
  host_fingerprint: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
  revoked_at: string | null;
  usage_count: number;
}

export interface SourceResponse {
  id: string;
  revision: number;
  owner_group_id: string;
  state: 'active' | 'paused' | 'blocked' | 'auth_error';
  generation: number;
  created_at: string;
  distribution_revoked_at?: string;
  kind: 'git';
  provider: string;
  canonical_url: string;
  repository_identity: string;
  branch: string;
  credential_ref: string | null;
  next_poll_at: number;
  last_success_at?: string;
  last_error_code?: string | null;
  last_observed_commit?: string;
  last_observed_revision?: number;
  targets: SourceTargetResponse[];
}

export interface SourceTargetResponse extends Policy {
  id: string;
  source_id: string;
  asset_id: string;
  path: string;
  enabled: boolean;
  retired_at: string | null;
  applies_to: Applicability;
  created_at: string;
  last_intake_id?: string;
  slug: string;
  kind: 'skill' | 'mcp';
}

export interface SourceSyncTargetResponse {
  id: string;
  binding_id: string;
  intake_id: string;
  state: IntakeState;
  version_id?: string | null;
  error_code?: string | null;
  reused?: boolean;
}

export interface SourceSyncJobResponse {
  id: string;
  state: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
  attempt: number;
  created_at: string;
  finished_at?: string;
  last_error_code?: string;
  error_message?: string;
  result?: { origin_commit: string; source_revision?: number; targets: SourceSyncTargetResponse[] };
}
