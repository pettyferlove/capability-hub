import type { ScopeType, SessionClientInfo } from '../identity.js';
import type { EpochMilliseconds, IsoDateTime, VersionedRecord } from './base.js';

export interface UserRecord extends VersionedRecord {
  username: string;
  display_name: string;
  password_hash: string;
  active: boolean;
  created_at: IsoDateTime;
  avatar_color?: string;
  title?: string;
  bio?: string;
  email?: string;
}

export interface GroupRecord extends VersionedRecord {
  name: string;
  active: boolean;
}

export interface MembershipRecord {
  id: string;
  user_id: string;
  group_id: string;
}

export interface RoleRecord extends VersionedRecord {
  name: string;
  key?: string;
  permissions: string[];
  builtin: boolean;
}

export interface RoleBindingRecord {
  id: string;
  principal_id: string;
  role_id: string;
  scope_type: ScopeType;
  scope_id: string;
}

export interface SessionRecord {
  id: string;
  user_id: string;
  csrf: string;
  created_at: IsoDateTime;
  expires_at: EpochMilliseconds;
  revoked_at: EpochMilliseconds | null;
  client: SessionClientInfo | null;
}

export interface TokenRecord {
  id: string;
  user_id: string;
  name: string;
  created_at: EpochMilliseconds;
  revoked_at: EpochMilliseconds | null;
  scope: 'hub:read' | 'hub:contribute';
}

export interface CliLoginRecord {
  id: string;
  code: string;
  challenge: string;
  state: 'pending' | 'approved' | 'consumed';
  expires_at: EpochMilliseconds;
  user_id?: string;
}

export interface LoginAttemptRecord {
  id: string;
  failure_count: number;
  window_expires_at: EpochMilliseconds;
}

export interface OAuthClientRecord {
  id: string;
  name: string;
  redirect_uris: string[];
  created_at: number;
}
export interface OAuthRequestRecord {
  id: string;
  client_id: string;
  redirect_uri: string;
  resource: string;
  scope: 'hub:read' | 'hub:contribute';
  challenge: string;
  state: string;
  expires_at: number;
  status: 'pending' | 'approved' | 'denied' | 'consumed';
  code: string | null;
  user_id: string | null;
  grant_id: string | null;
}
export interface OAuthGrantRecord {
  id: string;
  client_id: string;
  user_id: string;
  name: string;
  scope: 'hub:read' | 'hub:contribute';
  resource: string;
  created_at: number;
  last_used_at: number | null;
  revoked_at: number | null;
}
export interface OAuthCredentialRecord {
  id: string;
  grant_id: string;
  kind: 'access' | 'refresh';
  expires_at: number;
  consumed_at: number | null;
}
