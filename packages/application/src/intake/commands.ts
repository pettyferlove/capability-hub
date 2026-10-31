import type { AssetKind } from '@capability-hub/domain/content';
export type ReceiveIntakeCommand = {
  version_label: string;
  keywords?: string[];
} & (
  | { target: 'new'; slug: string; kind: AssetKind; owner_group_id: string }
  | { target: 'existing'; asset_id: string; version_mode?: 'automatic' | 'manual' }
);
export type IntakeStatus =
  | 'processing'
  | 'ready'
  | 'pending'
  | 'approved'
  | 'failed'
  | 'rejected'
  | 'stale'
  | 'cancelled'
  | 'deprecated'
  | 'blocked';
export interface IntakeListQuery {
  page?: number;
  page_size?: number;
  q?: string;
  state?: 'all' | IntakeStatus;
}
