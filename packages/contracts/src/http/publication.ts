import type { Applicability, Manifest } from '../content.js';
import type { SourceConsent } from '../publication.js';
import type { Policy } from '../policy.js';
import type { ManagementAssetResponse, VersionSnapshotResponse } from './catalog.js';
import type { ScanResponse } from './intake.js';

export interface PublicationRequestResponse extends Policy {
  id: string;
  revision: number;
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
  created_at: string;
  stale_reason?: string;
  decision_by?: string;
  decision_reason?: string;
  decided_at?: string;
  accepted_warnings?: { finding_id: string; reason: string }[];
}

export interface ReleaseResponse extends Policy {
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
  published_at: string;
}

export interface ChangeFileResponse {
  path: string;
  status: string;
  sha256: string;
  size: number;
}

export type ReviewResponse = PublicationRequestResponse & {
  visibility_label: string;
  asset: Pick<ManagementAssetResponse, 'id' | 'slug' | 'kind' | 'owner_group_id'>;
  candidate: Pick<
    VersionSnapshotResponse,
    'id' | 'version_label' | 'content_digest' | 'manifest' | 'metadata'
  >;
  current: {
    visibility_label: string;
    release: ReleaseResponse;
    version_label?: string;
    manifest?: Manifest;
  } | null;
  scan?: ScanResponse;
  submitter?: string;
  context_valid: boolean;
  can_decide: boolean;
  diff: ChangeFileResponse[];
};
