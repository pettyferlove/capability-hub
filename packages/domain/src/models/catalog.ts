import type { AssetKind } from '../content.js';
import type { ContentMetadata, Manifest, ManifestFile } from '../content.js';
import type { IsoDateTime, VersionedRecord } from './base.js';

export interface AssetRecord extends VersionedRecord {
  slug: string;
  kind: AssetKind;
  requires_api_key?: boolean;
  source_id: string;
  owner_group_id: string;
  lifecycle: 'active' | 'deprecated' | 'blocked';
  current_release_id: string | null;
  created_at: IsoDateTime;
  deprecation_reason?: string;
  replacement_asset_id?: string | null;
  source_missing_at?: IsoDateTime | null;
}

export interface StoredFile extends ManifestFile {
  blob_ref: string;
}

export interface VersionRecord {
  id: string;
  asset_id: string;
  version_label: string;
  origin_source_id: string;
  origin_ref: string;
  origin_commit: string;
  origin_path: string;
  intake_id: string;
  content_digest: string;
  artifact_digest: string;
  manifest_ref: string;
  artifact_ref: string;
  manifest: Manifest;
  files: StoredFile[];
  metadata: ContentMetadata;
  availability: 'unreleased' | 'released' | 'revoked';
  created_at: IsoDateTime;
}

export interface RecommendationRecord {
  id: string;
  user_id: string;
  version_id: string;
  created_at: IsoDateTime;
}

export interface ScenarioRecord {
  id: string;
  name: string;
  description: string;
  active: boolean;
}

export interface AssetFeedbackRecord {
  id: string;
  asset_id: string;
  version_id: string;
  submitted_by: string;
  request_key: string;
  request_hash: string;
  kind: 'defect' | 'capability_gap' | 'suggestion';
  title: string;
  scenario: string;
  expected: string;
  actual: string;
  location: string;
  reproduction: string;
  evidence: string;
  suggestion: string;
  blocking: boolean;
  status: 'pending' | 'in_progress' | 'resolved' | 'declined';
  resolution: string;
  fixed_version_id: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  revision: number;
}
