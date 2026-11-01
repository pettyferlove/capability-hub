import type { AuditActorSnapshot, AuditCategory, AuditSubjectSnapshot } from '../audit.js';

/**
 * 审计事件条目，出现在审计检索结果与详情。
 * `result` 是按事件定义判定的对外结果，`recorded_result` 是落库时的原始值；两者不同即
 * 表示历史事件被重新判定，页面需提示而不是改写原记录。
 */
export interface AuditEventResponse {
  id: string;
  occurred_at: string;
  action: string;
  action_label: string;
  category: AuditCategory;
  result: 'success' | 'failure';
  recorded_result: 'success' | 'failure';
  actor: AuditActorSnapshot & {
    id: string;
    name_source: 'event' | 'current' | 'unavailable';
    avatar_color?: string;
  };
  subject: AuditSubjectSnapshot & {
    id: string;
    name_source: 'event' | 'current' | 'unavailable';
    href: string | null;
  };
  reason: string;
  changes: { label: string; before: string; after: string }[];
  facts: { label: string; value: string }[];
}

/**
 * 审计检索分页：`total` 为过滤后的总数，`summary` 统计的是当前筛选条件下的
 * 失败、身份、发布与下载计数，与分页无关。
 */
export interface AuditLogResponse {
  items: AuditEventResponse[];
  total: number;
  page: number;
  page_size: number;
  summary: { failures: number; identity: number; publication: number; downloads: number };
}
