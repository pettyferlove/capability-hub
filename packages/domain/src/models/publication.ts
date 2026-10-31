import type { Applicability } from '../content.js';
import type { Policy, SourceConsent } from '../policy.js';
import type { IsoDateTime, VersionedRecord } from './base.js';

export interface PublicationRequestRecord extends VersionedRecord, Policy {
  requires_api_key?: boolean;
  nomination?: { release_id: string; reason: string };
  applies_to: Applicability;
  asset_id: string;
  version_id: string;
  source_intake_id: string;
  content_digest: string;
  policy_source_id: string;
  source_revision: number;
  source_consent: SourceConsent;
  scan_run_id: string;
  ruleset_version: string;
  approval_policy_digest: string;
  base_release_id: string | null;
  asset_revision: number;
  canonical_policy_json: string;
  policy_digest: string;
  historical: boolean;
  state: 'pending' | 'approved' | 'rejected' | 'cancelled' | 'stale';
  submitted_by: string;
  created_at: IsoDateTime;
  stale_reason?: string;
  decision_by?: string;
  decision_reason?: string;
  decided_at?: IsoDateTime;
  accepted_warnings?: { finding_id: string; reason: string }[];
}

export interface ReleaseRecord extends Policy {
  requires_api_key?: boolean;
  applies_to: Applicability;
  id: string;
  asset_id: string;
  version_id: string;
  request_id: string;
  release_seq: number;
  policy_source_id: string;
  source_revision: number;
  policy_digest: string;
  source_consent: SourceConsent;
  published_by: string;
  published_at: IsoDateTime;
}
