import type { Applicability, ContentMetadata, InstallationOption, Manifest } from '../content.js';
import type { ReleaseResponse } from './publication.js';
import type { Policy } from '../policy.js';

/**
 * 目录条目，出现在检索结果、资产详情与推荐位；详情与搜索结果同形，只是后者额外带命中原因。
 * 可见性已在服务端收敛，拿到的条目即当前主体有权读取的固定版本。
 */
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
  /** 当前已发布版本；其 `distribution` 为冻结后的策略快照，不随资产后续修改变化。 */
  current_release: {
    /** 面向用户的可见范围说明，由 `distribution` 渲染而来。 */
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
  /** 由当前主体权限推导，前端据此决定是否展示操作入口；真正的校验仍在服务端。 */
  permissions: {
    can_download: boolean;
    can_submit: boolean;
    can_lifecycle: boolean;
    can_revoke: boolean;
  };
  community: {
    recommendation_count: number;
    recommended: boolean;
    /** 当前主体的通用提名，`null` 表示未提名。 */
    nomination: { request_id: string; mine: boolean } | null;
  };
  /** 资产修订号，用于管理操作与审核的乐观锁。 */
  revision: number;
  /** 命中原因，仅搜索结果带；详情接口不返回该字段。 */
  match_reasons?: string[];
  /** 弃用原因；生命周期非 `deprecated` 时为空串。 */
  deprecation_reason: string;
  /** 弃用后指向的替代资产，可能为空表示暂无替代。 */
  replacement_asset_id?: string | null;
}

/** 管理端资产条目，出现在资产管理与导入页；比目录条目多出审核状态与当前发布链路。 */
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
  /** 是否能在目录里看到该资产；受限受众下可能为假。 */
  can_view_catalog: boolean;
  current_release: ReleaseResponse | null;
  current_version: Pick<VersionSnapshotResponse, 'version_label' | 'content_digest'> | null;
  latest_intake: { id: string; version_label: string; state: string } | null;
  pending_requests: { id: string; version_label: string }[];
}

/** 已有关键词联想，`items` 已去重并限制在查询的 `limit` 内。 */
export interface KeywordOptionsResponse {
  items: string[];
}

/**
 * 版本建议：`occupied_versions` 为已占用版本号，`suggestions` 给出 patch/minor/major 三档候选。
 * 建议基于当前时刻计算，采用前需重新确认，否则提交时会因建议过期被拒绝。
 */
export interface AssetVersionPlanResponse {
  current_version: string | null;
  latest_version: string | null;
  occupied_versions: string[];
  suggestions: Record<'patch' | 'minor' | 'major', string>;
}

/**
 * 检索结果分页：`counts` 在 `category` 过滤之前统计（`all` 与各分类计数），
 * 与过滤后的 `total` 不能互推；`next_cursor` 15 分钟后或查询条件变化后失效。
 */
export interface SearchResultResponse {
  items: AssetResponse[];
  total: number;
  next_cursor: string | null;
  counts: Record<string, number>;
}

/**
 * 关键词建议：约三分之二名额给热门词，其余按加权抽样补位（`discovery`），
 * 让低频与近期关键词也有机会出现，因此同一查询的 `discovery` 部分可能随机波动。
 */
export interface KeywordSuggestionsResponse {
  items: {
    keyword: string;
    asset_count: number;
    reason: 'popular' | 'discovery';
  }[];
}

/** 版本历史条目；`availability` 与 `published` 在部分视图下不返回，缺省即视为未知。 */
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

/** 版本快照，出现在资产详情、审核候选与导入详情；`manifest` 与 `metadata` 来自接收时的冻结结果。 */
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

/** 场景（业务领域），用于「场景」分类下的检索与发布策略。 */
export interface ScenarioResponse {
  id: string;
  name: string;
  description: string;
  active: boolean;
}
