import type { EpochMilliseconds, IsoDateTime } from './base.js';

/** 提示状态是单例记录，固定主键。 */
export const catalogPromptStateId = 'catalog-prompts';

/** PostgreSQL JSONB 不接受 NUL 或孤立代理项；同一提示须能在两库之间恢复。 */
export function isCatalogPromptText(value: string) {
  return !value.includes('\0') && !/[\ud800-\udfff]/u.test(value);
}

/** 生成批次引用的一个固定发布；展示和复核都要求它仍是资产当前发布且可分发。 */
export interface CatalogPromptSource {
  asset_id: string;
  version_id: string;
  /** 生成时资产的当前发布。 */
  release_id: string;
  /** 生成时该版本最近一次发布，与当前发布一起构成双重受众。 */
  resolved_release_id: string;
}

/** 预检真正走通的固定发布与证据字段，不保留模型判断原文。 */
export interface CatalogPromptBasis {
  asset_id: string;
  version_id: string;
  release_id: string;
  fields: ('tag' | 'scenario' | 'description')[];
}

/** 一条已通过安全筛选和可回答预检的开场提问。 */
export interface CatalogPromptItem {
  suggestion_ref: string;
  label: string;
  text: string;
  basis: CatalogPromptBasis;
}

/** 同一受众签名的一批提示；新批次替换同签名旧批次，展示前整批复核。 */
export interface CatalogPromptBatch {
  id: string;
  audience: 'public' | 'restricted';
  audience_signature: string;
  input_digest: string;
  policy_digest: string;
  sources: CatalogPromptSource[];
  generated_at: IsoDateTime;
  prompts: CatalogPromptItem[];
}

/** 当前刷新窗口；`reserved` 是已预占的出站次数，`deadline` 自首次准备外呼起算。 */
export interface CatalogPromptWindow {
  start: EpochMilliseconds;
  job_id: string;
  reserved: number;
  deadline: EpochMilliseconds | null;
}

/**
 * 后台提示的调度与结果单例。`active_job_id` 非空时同窗不再入队；
 * `cursor` 是受限批次轮转到的最后一个受众签名。
 */
export interface CatalogPromptStateRecord {
  id: string;
  next_refresh_at: EpochMilliseconds;
  active_job_id: string | null;
  window: CatalogPromptWindow | null;
  cursor: string | null;
  batches: CatalogPromptBatch[];
  updated_at: IsoDateTime;
}
