export interface Principal {
  id: string;
  username: string;
  display_name: string;
  active: boolean;
  revision: number;
  groups: string[];
  bindings: { role_id: string; scope_type: ScopeType; scope_id: string }[];
  permissions: Record<string, string[]>;
}

export interface SessionClientInfo {
  browser_name: string | null;
  browser_version: string | null;
  os_name: string | null;
  device_type: 'desktop' | 'mobile' | 'tablet' | 'unknown';
}

export type ScopeType = 'platform' | 'team' | 'source' | 'asset' | 'scenario';
