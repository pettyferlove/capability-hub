import type { AssetKind } from '@capability-hub/domain/content';
import type { Policy } from '@capability-hub/domain/policy';

/** 来自已校验的 HTTP 查询；待审筛选沿用候选可见权限，越界页回退到末页。 */
export interface ManagementAssetListQuery {
  q?: string;
  state?:
    'all' | 'needs_attention' | 'processing' | 'pending' | 'active' | 'deprecated' | 'blocked';
  sort?: 'recent_activity' | 'name';
  page?: number;
  page_size?: number;
}

/**
 * 关键词联想输入，来自管理端 HTTP query（`keywordOptionsQuerySchema` 解析）；
 * 结果只统计调用者有权限看到的关键词，未发布内容不会泄露给非维护者。
 */
export interface KeywordOptionsQuery {
  /** 已归一化的小写子串过滤串，上限 128 字符；空串表示不过滤。 */
  q: string;
  /** 1–20，默认 20；超出部分直接截断而不是拒绝。 */
  limit: number;
}

/**
 * 目录检索输入，来自 HTTP 的 `GET /api/assets` query（`catalogSearchQuerySchema` 解析）；
 * 可见性由服务端按受众与授权重新判定，客户端传入的过滤条件只做收窄。
 */
export interface CatalogSearchQuery {
  /** 中文按词、其他文本按空白匹配名称/标签/描述，上限 500 字符；空串按发布时间倒序浏览。 */
  q?: string;
  kind?: AssetKind;
  category?: Policy['category'];
  /** 命中任一场景即可。 */
  scenario_id?: string;
  /**
   * 不透明签名游标，由上一页返回；指纹绑定查询条件、身份授权快照与目录修订号，
   * 任一变化或过期都会 400/`CURSOR_EXPIRED`，不做静默重排。
   */
  cursor?: string;
  /** 1–50，默认 20。 */
  limit?: number;
  /** 只做加权加分，不参与过滤；每项上限 20 个。 */
  languages?: string[];
  frameworks?: string[];
}

/**
 * 关键词推荐输入，来自 HTTP 的 `GET` query（`keywordSuggestionsQuerySchema` 解析）；
 * 结果同时包含高热词与随机探索词，因此同一输入不保证稳定输出。
 */
export interface KeywordSuggestionsQuery {
  kind?: AssetKind;
  category?: Policy['category'];
  scenario_id?: string;
  /** 1–20，默认 8；其中约三分之一名额留给低频词抽样。 */
  limit?: number;
}

/**
 * 反馈列表输入，来自 HTTP 的 `GET` query（`assetFeedbackQuerySchema` 解析）；
 * 非维护者只能看到自己的反馈，分页在可见集合上计算。
 */
export interface AssetFeedbackQuery {
  /** 1–100000，必填，不做越界夹取。 */
  page: number;
  /** 1–50，默认 10。 */
  limit: number;
  status?: 'pending' | 'in_progress' | 'resolved' | 'declined';
}
