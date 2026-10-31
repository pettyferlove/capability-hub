import type { ContentFile, AssetKind } from '@capability-hub/domain/content';

export interface GitDestination {
  url: string;
  identity: string;
  host: string;
  address: string;
  transport: 'https' | 'ssh';
  port: number;
  username: string;
}
export interface GitSnapshot {
  commit: string;
  credential_revision?: number;
  read(path: string, kind: AssetKind): Promise<ContentFile[]>;
  close(): Promise<void>;
}
export interface GitRepository {
  validate(url: string): Promise<GitDestination>;
  branch(branch: string): Promise<void>;
  snapshot(source: {
    canonical_url: string;
    branch: string;
    credential_ref?: string | null;
  }): Promise<GitSnapshot>;
}
