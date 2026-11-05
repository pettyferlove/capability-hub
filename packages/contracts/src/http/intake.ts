import type { Applicability, Finding } from '../content.js';
import type { IntakeProgressResponse, IntakeState, IntakeStatus } from '../intake.js';
import type { Policy } from '../policy.js';
import type { VersionSnapshotResponse, ManagementAssetResponse } from './catalog.js';
import type { PublicationRequestResponse } from './publication.js';

/** 新建资源的归属候选，仅包含已加入且有创建权限的启用团队。 */
export interface ShareTeamsResponse {
  teams: { id: string; name: string }[];
}

/**
 * 导入处理明细，出现在导入列表与详情；`progress` 与进度接口同源，
 * `state` 是处理机状态，`phase` 是给人看的当前阶段说明。
 */
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
  /** 重新扫描时指向被取代的那次导入。 */
  rescan_of?: string;
  /** 历史补录的导入，不要求当时存在扫描记录。 */
  historical?: boolean;
  error_code?: string | null;
  error_message?: string | null;
  retryable?: boolean;
}

/**
 * 导入详情：`version`、`scan`、`publication` 在处理未走完时都可能为 `null`；
 * `proposed_*` 是扫描推断出的策略与适用范围，`ruleset_current` 为假表示扫描规则集已过期，
 * 需要重扫后才能提交发布。
 */
export interface IntakeResponse extends IntakeDetails {
  asset_slug: string;
  current_release_id: string | null;
  current_version: ManagementAssetResponse['current_version'];
  asset_lifecycle: ManagementAssetResponse['lifecycle'];
  asset_lifecycle_reason: string;
  can_maintain: boolean;
  can_view_catalog: boolean;
  version?: VersionSnapshotResponse | null;
  scan?: ScanResponse | null;
  publication: PublicationRequestResponse | null;
  proposed_policy: Policy;
  proposed_applies_to: Applicability;
  proposed_requires_api_key: boolean;
  ruleset_current: boolean;
}

/** 导入列表条目：`status` 为聚合后的业务状态，`file_count` 在尚无版本时为 `null`。 */
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

/**
 * 导入列表分页：`counts` 在过滤前统计可见行，`processing_total` 统计仍在接收/拉取/扫描的行，
 * 两者都不受当前分页影响；页码越界时回落到最后一页。
 */
export interface IntakeListResponse {
  items: IntakeListItemResponse[];
  total: number;
  page: number;
  page_size: number;
  counts: Record<string, number>;
  processing_total: number;
}

/**
 * 一次内容扫描的结果：`state` 只有通过与阻断两种；`ruleset_version` 与
 * `scanner_version` 用于判断该记录是否仍反映当前规则集，过期即需重扫。
 */
export interface ScanResponse {
  id: string;
  version_id: string;
  ruleset_version: string;
  scanner_version: string;
  state: 'passed' | 'blocked';
  findings: Finding[];
  finished_at: string;
}
