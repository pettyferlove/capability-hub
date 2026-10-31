import type { AssetKind } from '@capability-hub/domain/content';
import type { Policy } from '@capability-hub/domain/policy';
export interface KeywordOptionsQuery {
  q: string;
  limit: number;
}
export interface CatalogSearchQuery {
  q?: string;
  kind?: AssetKind;
  category?: Policy['category'];
  scenario_id?: string;
  cursor?: string;
  limit?: number;
  languages?: string[];
  frameworks?: string[];
}
export interface KeywordSuggestionsQuery {
  kind?: AssetKind;
  category?: Policy['category'];
  scenario_id?: string;
  limit?: number;
}

export interface AssetFeedbackQuery {
  page: number;
  limit: number;
  status?: 'pending' | 'in_progress' | 'resolved' | 'declined';
}
