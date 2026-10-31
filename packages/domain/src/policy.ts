export interface Policy {
  category: 'general' | 'scenario' | 'uncategorized';
  scenario_ids: string[];
  distribution: {
    mode: 'approved_audience';
    audience: string[];
  };
}

export interface SourceConsent {
  actor_id: string;
  confirmed_at: string;
  permission_basis: string;
  purpose: string;
  content_digest: string;
  audience: string[];
}
