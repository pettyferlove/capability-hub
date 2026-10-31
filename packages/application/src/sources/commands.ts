import type { Applicability } from '@capability-hub/domain/content';
import type { AssetKind } from '@capability-hub/domain/content';
import type { Policy } from '@capability-hub/domain/policy';
export interface SourceTarget extends Policy {
  slug: string;
  kind: AssetKind;
  path: string;
  applies_to?: Applicability;
  binding_id?: string;
  asset_id?: string;
  enabled?: boolean;
}
export interface CreateSourceCommand {
  repository_url: string;
  provider: 'generic-git';
  branch: string;
  credential_ref?: string;
  owner_group_id: string;
  targets: Omit<SourceTarget, 'binding_id' | 'asset_id' | 'enabled'>[];
}
export interface UpdateSourceCommand {
  branch?: string;
  credential_ref?: string | null;
  state?: 'active' | 'paused';
  targets?: SourceTarget[];
}
