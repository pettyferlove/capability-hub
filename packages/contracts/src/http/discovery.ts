import type { DiscoveryCriteria } from '../discovery.js';
import type { Policy } from '../policy.js';
import type { EvaluationSummaryResponse } from './evaluation.js';

/** 一条已通过整批复核、当前访客可见的开场提问；`suggestion_ref` 只定位提示，不授予读取权限。 */
export interface DiscoverySuggestionResponse {
  label: string;
  text: string;
  suggestion_ref: string;
}

/** 首页入口状态；不试拨模型，无模型时 `suggestions` 为空。 */
export interface DiscoveryEntryResponse {
  mode: 'dialogue' | 'keywords';
  viewer_key: string;
  suggestions: DiscoverySuggestionResponse[];
}

/**
 * 命中或证实依据。带 `requirement` 的条目由固定版本的标签、场景或发布原句证实该必需项；
 * 不带的只说明召回位置，不证明满足要求。
 */
export interface DiscoveryMatchReason {
  field: 'name' | 'tag' | 'scenario' | 'description';
  text: string;
  requirement?: string;
}

/**
 * 模型对本轮问题的判断，属 AI 生成，不是发布信息；`quote` 只在能于该版本标签、场景或简介里
 * 逐字找到时给出。
 */
export interface DiscoveryJudgment {
  fit: 'direct' | 'partial';
  reason: string;
  quote: string | null;
}

/**
 * 固定版本结果卡；只含目录已有字段，`unverified` 列出该版本发布信息未能证实的必需项。
 * 由模型挑出的结果带 `judgment`，按条件筛选的结果不带。
 */
export interface DiscoveryResultResponse {
  asset_id: string;
  slug: string;
  kind: 'skill' | 'mcp';
  version_id: string;
  version_label: string;
  category: Policy['category'];
  owner_name: string;
  visibility_label: string;
  published_at: string;
  description: string;
  has_scripts: boolean;
  match_reasons: DiscoveryMatchReason[];
  unverified: string[];
  judgment?: DiscoveryJudgment;
  /** 只用于展示，不作为模型输入或挑选候选的依据。 */
  evaluation?: EvaluationSummaryResponse;
}

/**
 * 可选的意图方向；每项都有一个当前可读的代表发布支持。选中时以 `direction` 按序号展开：
 * 有模型为该方向挑出的资源就直接列出，否则按 `criteria` 查目录。
 */
export interface DiscoveryDirectionResponse {
  label: string;
  intent: string;
  example: { slug: string; kind: 'skill' | 'mcp' };
  criteria: DiscoveryCriteria;
}

interface DialogueTurn {
  mode: 'dialogue';
  reply: string;
  goal: string | null;
  criteria: DiscoveryCriteria;
  /** 下一轮原样回传的签名上下文。 */
  context: string;
}

/**
 * 一轮的结果。`guide` 给可回答的问题或有依据的方向，`matches` 给模型挑出的固定版本（带 `judgment`），
 * 或按条件筛选时证实了全部必需项的固定版本（`partial` 只证实了部分必需项）；`reference` 回答
 * 上一轮按原序号所指的一项。关键词模式只有现有排序的结果卡，没有回应和上下文。
 */
export type DiscoveryTurnResponse =
  | { mode: 'keywords'; type: 'matches'; total: number; items: DiscoveryResultResponse[] }
  | (DialogueTurn & {
      type: 'guide';
      directions: DiscoveryDirectionResponse[];
      items: DiscoveryResultResponse[];
    })
  | (DialogueTurn & {
      type: 'matches';
      total: number;
      items: DiscoveryResultResponse[];
      partial: DiscoveryResultResponse[];
      missing: string[];
    })
  | (DialogueTurn & { type: 'reference'; item: DiscoveryResultResponse | null });
