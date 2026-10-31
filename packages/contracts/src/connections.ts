export interface ConnectionResponse {
  id: string;
  name: string;
  scope: 'hub:read' | 'hub:contribute';
  created_at: number;
  last_used_at: number | null;
  revoked_at: number | null;
}
export interface ConnectionAuthorizationResponse {
  client_name: string;
  redirect_origin: string;
  resource: string;
  scope: 'hub:read' | 'hub:contribute';
  expires_at: number;
}
