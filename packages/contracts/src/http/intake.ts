import type { Applicability, Finding } from '../content.js';
import type { IntakeProgressResponse, IntakeState, IntakeStatus } from '../intake.js';
import type { Policy } from '../policy.js';
import type { VersionSnapshotResponse, ManagementAssetResponse } from './catalog.js';
import type { PublicationRequestResponse } from './publication.js';

export interface IntakeDetails {
  id: string;
  source_id: string;
  asset_id: string;
  requested_by: string;
  version_label: string;
  source_revision: number;
  state: IntakeState;
  phase: string;
  progress: IntakeProgressResponse['progress'];
  created_at: string;
  filename?: string;
  keywords?: string[];
  binding_id?: string | null;
  source_sync_job_id?: string;
  source_generation?: number | null;
  origin_ref?: string;
  origin_commit?: string;
  origin_path?: string;
  version_id?: string | null;
  content_digest?: string | null;
  scan_run_id?: string | null;
  processing_ruleset?: string;
  finished_at?: string | null;
  rescan_of?: string;
  historical?: boolean;
  error_code?: string | null;
  error_message?: string | null;
  retryable?: boolean;
}

export interface IntakeResponse extends IntakeDetails {
  asset_slug: string;
  asset_lifecycle: ManagementAssetResponse['lifecycle'];
  asset_lifecycle_reason: string;
  can_view_catalog: boolean;
  version?: VersionSnapshotResponse | null;
  scan?: ScanResponse | null;
  publication: PublicationRequestResponse | null;
  proposed_policy: Policy;
  proposed_applies_to: Applicability;
  ruleset_current: boolean;
}

export interface IntakeListItemResponse {
  id: string;
  asset_id: string;
  asset_slug: string;
  kind: ManagementAssetResponse['kind'];
  version_label: string;
  created_at: string;
  status: IntakeStatus;
  phase: string;
  source_kind: 'upload' | 'git';
  content_digest: string | null;
  file_count: number | null;
  error_message: string | null;
}

export interface IntakeListResponse {
  items: IntakeListItemResponse[];
  total: number;
  page: number;
  page_size: number;
  counts: Record<string, number>;
  processing_total: number;
}

export interface ScanResponse {
  id: string;
  version_id: string;
  ruleset_version: string;
  scanner_version: string;
  state: 'passed' | 'blocked';
  findings: Finding[];
  finished_at: string;
}
