import type { SessionClientInfo } from '../identity.js';
import type { ScopeType } from '../identity.js';

export interface MeResponse {
  id: string;
  username: string;
  display_name: string;
  avatar_color?: string;
  groups: { id: string; name: string }[];
  capabilities: {
    can_ai: boolean;
    can_admin: boolean;
    can_audit: boolean;
    can_manage_assets?: boolean;
    can_publish: boolean;
    can_review: boolean;
  };
  features: { git_hosts: string[] };
  csrf_token: string;
}

export interface AuthStatusResponse {
  initialized: boolean;
  setup_token_required: boolean;
  auth_provider: string;
  oidc_enabled: boolean;
}

export interface PublicUserResponse {
  id: string;
  revision: number;
  username: string;
  display_name: string;
  active: boolean;
  created_at: string;
  avatar_color?: string;
  title?: string;
  bio?: string;
  email?: string;
}

export interface GroupResponse {
  id: string;
  revision: number;
  name: string;
  active: boolean;
}

export interface MembershipResponse {
  id: string;
  user_id: string;
  group_id: string;
}

export interface RoleResponse {
  id: string;
  revision: number;
  name: string;
  key?: string;
  permissions: string[];
  builtin: boolean;
}

export interface RoleBindingResponse {
  id: string;
  principal_id: string;
  role_id: string;
  scope_type: ScopeType;
  scope_id: string;
}

export interface IdentitySnapshotResponse {
  users: PublicUserResponse[];
  groups: GroupResponse[];
  memberships: MembershipResponse[];
  roles: RoleResponse[];
  bindings: RoleBindingResponse[];
  permissions: string[];
}

export type ProfileResponse = Pick<
  PublicUserResponse,
  'id' | 'username' | 'display_name' | 'revision' | 'created_at'
> & {
  title: string;
  bio: string;
  email: string;
  avatar_color: string;
  roles: { name?: string; scope_type: string; scope_id: string }[];
  stats: { submissions: number; decisions: number; credentials: number };
};

export interface SessionResponse {
  id: string;
  created_at: string;
  expires_at: number;
  client: SessionClientInfo | null;
  current: boolean;
}

export interface TokenResponse {
  id: string;
  name: string;
  created_at: number;
  revoked_at: number | null;
  scope: 'hub:read' | 'hub:contribute';
}

export interface IssuedTokenResponse {
  token: string;
}

export type CliLoginPollResponse =
  { state: 'pending' } | ({ state: 'complete' } & IssuedTokenResponse);

export interface ActivityResponse {
  id: string;
  occurred_at: string;
  action: string;
  action_label: string;
  entity_id: string;
  result: 'success' | 'failure';
}
