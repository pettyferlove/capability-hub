import type { EncryptedCredential, GitCredentialRecord } from '@capability-hub/domain/models';

export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(password: string, hash: string): Promise<boolean>;
}
export type CredentialIdentity = Pick<GitCredentialRecord, 'id' | 'user_id' | 'host' | 'kind'>;
export interface CredentialSecret {
  secret: string;
  passphrase: string;
}
export interface CredentialCipher {
  seal(identity: CredentialIdentity, value: CredentialSecret): EncryptedCredential;
  open(identity: CredentialIdentity, encrypted: EncryptedCredential): CredentialSecret;
}
export interface SshKeyInspector {
  inspect(input: { privateKey: string; passphrase: string; hostKey: string }): Promise<{
    fingerprint: string;
    hostFingerprint: string;
  }>;
}
export interface ResolvedCredential extends CredentialSecret {
  kind: 'token' | 'ssh';
  username: string;
  auth_method: 'basic' | 'bearer';
  host_key: string;
  revision: number;
}
export interface GitCredentialResolver {
  resolve(id: string, host: string, transport: string): Promise<ResolvedCredential>;
  currentRevision(id: string): Promise<number>;
}
