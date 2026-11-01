/**
 * 反馈详情，出现在反馈列表与详情；`can_manage` 表示当前主体能否改状态（维护者）。
 * `revision` 为乐观锁版本，提交更新时必须原样带回。
 */
export interface AssetFeedbackResponse {
  id: string;
  asset_id: string;
  version_id: string;
  submitted_by: string;
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
  version_label: string;
  fixed_version_label: string | null;
  can_manage: boolean;
  detail_url: string;
}

/** 反馈分页：`total` 为可见条目总数（非本页条数），`limit` 回显请求的每页条数。 */
export interface AssetFeedbackListResponse {
  items: AssetFeedbackResponse[];
  total: number;
  page: number;
  limit: number;
}
