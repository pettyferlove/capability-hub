import type { EncryptedCredential, GitCredentialRecord } from '@capability-hub/domain/models';

/**
 * 口令哈希端口。实现方必须自带随机盐、用慢哈希并做时序安全比较；
 * `verify` 遇到格式非法的哈希只能返回 `false`，不能抛错（登录失败统计依赖这一点）。
 */
export interface PasswordHasher {
  /** 密码本身的长度/强度限制由实现方决定（当前为 12–256 位，越界 422/`PASSWORD_LENGTH`）。 */
  hash(password: string): Promise<string>;
  verify(password: string, hash: string): Promise<boolean>;
}

/** 密文绑定的身份维度：脱离这些字段，密文既不能解密也不应被复用。 */
export type CredentialIdentity = Pick<GitCredentialRecord, 'id' | 'user_id' | 'host' | 'kind'>;

/** 明文凭据材料；只在内存中短暂存在，不得写入日志、审计或响应。 */
export interface CredentialSecret {
  secret: string;
  passphrase: string;
}

/**
 * 凭据密封端口。实现方必须把 {@link CredentialIdentity} 绑定进认证（如 AEAD 的 AAD），
 * 使密文无法跨账号、跨域名或跨认证类型复用，并检测篡改。
 */
export interface CredentialCipher {
  /** 允许每次调用产生不同密文（随机 IV）；同一身份下解出结果必须与原值一致。 */
  seal(identity: CredentialIdentity, value: CredentialSecret): EncryptedCredential;
  /** 身份与密文不匹配或密文被篡改时必须抛错，由调用方转成 500/`CREDENTIAL_DECRYPTION`。 */
  open(identity: CredentialIdentity, encrypted: EncryptedCredential): CredentialSecret;
}

/**
 * SSH 私钥校验端口。实现方需在隔离环境里试签，不得让私钥或口令进入日志与常驻存储。
 */
export interface SshKeyInspector {
  /** 校验私钥可被口令解开且与给定主机公钥配对，返回密钥与主机指纹用于展示。 */
  inspect(input: { privateKey: string; passphrase: string; hostKey: string }): Promise<{
    fingerprint: string;
    hostFingerprint: string;
  }>;
}

/**
 * 可直接交给 Git 传输层的凭据材料。`revision` 与记录当前值对应，
 * 调用方据此判断同步途中是否被轮换。
 */
export interface ResolvedCredential extends CredentialSecret {
  kind: 'token' | 'ssh';
  username: string;
  auth_method: 'basic' | 'bearer';
  host_key: string;
  revision: number;
}

/**
 * Git 凭据解析端口。实现方必须在解密前重新校验可用性以及与 host/transport 的匹配
 * （422/`CREDENTIAL_MISMATCH`、422/`CREDENTIAL_UNAVAILABLE`）。
 */
export interface GitCredentialResolver {
  /** 凭据需属于该 `host` 且认证方式与 `transport` 一致，否则拒绝而不是降级。 */
  resolve(id: string, host: string, transport: string): Promise<ResolvedCredential>;
  /** 供来源固化并在轮换后判定是否需重拉；凭据不可用时同样抛错。 */
  currentRevision(id: string): Promise<number>;
}
