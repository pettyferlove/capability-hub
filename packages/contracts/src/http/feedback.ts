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
export interface AssetFeedbackListResponse {
  items: AssetFeedbackResponse[];
  total: number;
  page: number;
  limit: number;
}
