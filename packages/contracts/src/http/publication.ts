import type { Applicability, Manifest } from '../content.js';
import type { SourceConsent } from '../publication.js';
import type { Policy } from '../policy.js';
import type { ManagementAssetResponse, VersionSnapshotResponse } from './catalog.js';
import type { ScanResponse } from './intake.js';

/**
 * 发布申请，出现在审核队列、审核详情与导入详情；内嵌的发布策略字段来自提交时的冻结快照，
 * 因此即使用户后续改了策略也不会变。`policy_digest` 是审核时需回传的摘要。
 */
export interface PublicationRequestResponse extends Policy {
  requires_api_key?: boolean;
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

/** 已发布版本，是目录展示与下载的依据；策略与受众同样在此冻结。 */
export interface ReleaseResponse extends Policy {
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
  published_at: string;
}

/** 审核 diff 中的文件变更项：`status` 取 `added`/`modified`/`unchanged`/`removed`，用于和当前发布对比。 */
export interface ChangeFileResponse {
  path: string;
  status: string;
  sha256: string;
  size: number;
}

/**
 * 审核详情：在申请之上补充候选版本、当前发布、扫描与文件 diff。
 * `context_valid` 表示提交时的上下文（资产与来源修订、扫描规则集、生命周期）是否仍一致；
 * `can_decide` 额外要求申请待审、非本人提交或本人授权，并且具备对应范围的审查权限。
 */
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
    content_digest?: string;
    manifest?: Manifest;
  } | null;
  scan?: ScanResponse;
  submitter?: string;
  context_valid: boolean;
  can_decide: boolean;
  diff: ChangeFileResponse[];
};
