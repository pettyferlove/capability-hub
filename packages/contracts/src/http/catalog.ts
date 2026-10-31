import type { Applicability, ContentMetadata, InstallationOption, Manifest } from '../content.js';
import type { ReleaseResponse } from './publication.js';
import type { Policy } from '../policy.js';

export interface AssetResponse {
  asset_id: string;
  slug: string;
  kind: 'skill' | 'mcp';
  requires_api_key: boolean;
  lifecycle: 'active' | 'deprecated' | 'blocked';
  description: string;
  owner: { id: string; name: string };
  source: { kind: 'upload' | 'git'; repository_url?: string };
  applies_to: Applicability;
  current_release: {
    visibility_label: string;
    release_id: string;
    version_id: string;
    version_label: string;
    category: Policy['category'];
    scenario_ids: string[];
    distribution: Policy['distribution'];
    published_at: string;
    has_scripts: boolean;
    has_archives?: boolean;
  };
  content_digest: string;
  artifact_digest: string;
  files: { path: string; size: number; sha256: string; executable: boolean }[];
  installation_options: InstallationOption[];
  metadata: {
    compatibility?: string;
    registry_name?: string;
    tools_verified?: boolean;
    declared_tools?: string[];
  };
  permissions: {
    can_download: boolean;
    can_submit: boolean;
    can_lifecycle: boolean;
    can_revoke: boolean;
  };
  community: {
    recommendation_count: number;
    recommended: boolean;
    nomination: { request_id: string; mine: boolean } | null;
  };
  revision: number;
  match_reasons?: string[];
  deprecation_reason: string;
  replacement_asset_id?: string | null;
}

export interface ManagementAssetResponse {
  id: string;
  revision: number;
  slug: string;
  kind: 'skill' | 'mcp';
  requires_api_key: boolean;
  owner_group_id: string;
  source_id: string;
  source_kind: 'upload' | 'git';
  lifecycle: 'active' | 'deprecated' | 'blocked';
  current_release_id: string | null;
  can_submit: boolean;
  can_lifecycle: boolean;
  can_view_catalog: boolean;
  current_release: ReleaseResponse | null;
}

export interface KeywordOptionsResponse {
  items: string[];
}

export interface AssetVersionPlanResponse {
  current_version: string | null;
  latest_version: string | null;
  occupied_versions: string[];
  suggestions: Record<'patch' | 'minor' | 'major', string>;
}

export interface SearchResultResponse {
  items: AssetResponse[];
  total: number;
  next_cursor: string | null;
  counts: Record<string, number>;
}

export interface KeywordSuggestionsResponse {
  items: {
    keyword: string;
    asset_count: number;
    reason: 'popular' | 'discovery';
  }[];
}

export interface VersionHistoryResponse {
  version_id: string;
  version_label: string;
  availability?: 'unreleased' | 'released' | 'revoked';
  content_digest: string;
  created_at: string;
  published_at?: string;
  release_id?: string;
  published?: boolean;
}

export interface VersionSnapshotResponse {
  id: string;
  asset_id: string;
  version_label: string;
  content_digest: string;
  artifact_digest: string;
  manifest: Manifest;
  metadata: ContentMetadata;
  availability: 'unreleased' | 'released' | 'revoked';
  created_at: string;
}

export interface ScenarioResponse {
  id: string;
  name: string;
  description: string;
  active: boolean;
}
