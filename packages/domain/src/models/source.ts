import type { Applicability } from '../content.js';
import type { Policy } from '../policy.js';
import type { EpochMilliseconds, IsoDateTime, VersionedRecord } from './base.js';

interface SourceBase extends VersionedRecord {
  owner_group_id: string;
  state: 'active' | 'paused' | 'blocked' | 'auth_error';
  generation: number;
  created_at: IsoDateTime;
  distribution_revoked_at?: IsoDateTime;
}

/**
 * 上传型来源：内容由上传承载，不轮询外部仓库。`kind` 决定同步路径，因此不能与其他类型互转。
 */
export interface UploadSourceRecord extends SourceBase {
  kind: 'upload';
}

/**
 * Git 型来源：由定时同步作业轮询仓库，`credential_ref` 指向安装者自己的凭据记录。
 */
export interface GitSourceRecord extends SourceBase {
  kind: 'git';
  provider: string;
  /** 规范化后的仓库地址（去凭据、统一大小写与端口），用于判重与展示。 */
  canonical_url: string;
  /** 不含凭据的仓库身份标识，用于识别同一仓库的别名地址。 */
  repository_identity: string;
  branch: string;
  /** 凭据记录 id；同步作业据此取用，凭据被替换后旧作业必须重跑（409 `CREDENTIAL_CHANGED`）。 */
  credential_ref: string | null;
  /** 下次轮询时刻 epoch 毫秒；失败会顺延 5 分钟，避免反复打爆上游。 */
  next_poll_at: EpochMilliseconds;
  last_success_at?: IsoDateTime;
  /** 最近一次同步失败的机器可读错误码；认证类失败会同时把 `state` 置为 `auth_error`。 */
  last_error_code?: string | null;
  /** 上次同步观察到的提交，与 `last_observed_revision` 一起判断仓库是否真有变化。 */
  last_observed_commit?: string;
  /** 上次同步时的来源修订号，用于区分「内容变了」与「配置变了」。 */
  last_observed_revision?: number;
}

/**
 * 来源记录（按 `kind` 区分的联合类型）；`state` 中 `blocked` 与
 * `distribution_revoked_at` 非空都会让已发布内容立即不可访问，且不可被后续同步绕过。
 */
export type SourceRecord = UploadSourceRecord | GitSourceRecord;

/**
 * 来源与资产的绑定：说明「从哪个来源的哪条路径，按什么策略，产出哪个资产」。
 * 同一来源内启用中的绑定路径不得重复或互相包含（按 `collisionKey` 判定），否则同步会重复产出。
 */
export interface BindingRecord extends Policy {
  id: string;
  source_id: string;
  asset_id: string;
  /** 来源内的相对路径；`skill` 允许 `.`，`mcp` 必须指向 `server.json`。 */
  path: string;
  /** 关闭后同步会跳过该绑定，但历史接收记录仍保留。 */
  enabled: boolean;
  /** 退役时间；非空即视为永久失效，配置变更会使进行中的同步以 409 结束。 */
  retired_at: IsoDateTime | null;
  applies_to: Applicability;
  created_at: IsoDateTime;
  /** 最近一次由该绑定产出的接收记录，便于从绑定追溯到版本。 */
  last_intake_id?: string;
}

/**
 * AES-256-GCM 加密后的凭据载荷，三个字段均为标准 base64。
 * 密文以 `[id, user_id, host, kind]` 作为 AAD，因此换账号、换域名或换认证方式后旧密文无法解密——
 * 迁移身份时必须重新加密，而不能只搬字段。
 */
export interface EncryptedCredential {
  iv: string;
  tag: string;
  data: string;
}

/**
 * 安装者自用的 Git 凭据。`host` 必须在管理员允许列表内，且与 `kind` 一经创建不可更改
 * （要换域名或认证方式只能新建）；`encrypted` 为 `null` 表示凭据内容已不可用，
 * 此时同步按认证失败处理，不会降级为匿名访问。
 */
export interface GitCredentialRecord extends VersionedRecord {
  /** 凭据归属者；只有本人可读取、修改与使用。 */
  user_id: string;
  name: string;
  host: string;
  kind: 'token' | 'ssh';
  username: string;
  auth_method: 'basic' | 'bearer';
  /**
   * Git 服务的主机公钥（`ssh-ed25519`/`ssh-rsa`/`ecdsa-*` 算法前缀 + Base64），
   * 用于严格校验服务器身份；只接受这一格式，缺失即拒绝。`token` 凭据不接受该字段。
   */
  host_key: string;
  /** 由服务端从私钥解析出的指纹，仅供展示；`token` 凭据为 `null`。 */
  fingerprint: string | null;
  /** 首次连接时记录的主机公钥指纹，用于校验仍是同一台服务器。 */
  host_fingerprint: string | null;
  /** 过期时间；已过期时同步按认证失败处理，不会回退到无凭据访问。 */
  expires_at: IsoDateTime | null;
  created_at: IsoDateTime;
  updated_at: IsoDateTime;
  revoked_at: IsoDateTime | null;
  encrypted: EncryptedCredential | null;
}
