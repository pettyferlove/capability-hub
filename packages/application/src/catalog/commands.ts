export interface RecommendationCommand {
  version_id: string;
  recommended: boolean;
}

export interface AssetFeedbackCommand {
  version_id: string;
  idempotency_key: string;
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
  consent: true;
}
export interface AssetFeedbackUpdateCommand {
  revision: number;
  status: 'pending' | 'in_progress' | 'resolved' | 'declined';
  resolution: string;
  fixed_version_id: string | null;
}
