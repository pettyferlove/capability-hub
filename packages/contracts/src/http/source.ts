import type { Applicability } from '../content.js';
import type { Policy } from '../policy.js';
import type { IntakeState } from '../intake.js';

/**
 * 用户自备 Git 凭据的元数据，出现在个人中心的凭据列表；密文与口令从不回显。
 * `host` 与 `kind` 一经创建不可改（换域名或认证方式需新建）；`usage_count` 为引用该凭据的来源数。
 */
export interface GitCredentialResponse {
  id: string;
  revision: number;
  user_id: string;
  name: string;
  host: string;
  kind: 'token' | 'ssh';
  username: string;
  auth_method: 'basic' | 'bearer';
  /** SSH 必填的主机公钥，用于严格校验服务器身份；token 凭据为空串。 */
  host_key: string;
  /** 私钥指纹，仅 SSH 有值，用于比对而不暴露私钥。 */
  fingerprint: string | null;
  /** 主机公钥指纹，仅 SSH 有值。 */
  host_fingerprint: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
  revoked_at: string | null;
  usage_count: number;
}

/**
 * Git 来源，出现在来源管理列表。`generation` 是同步代号，每次同步自增，
 * 旧代次的同步结果会被丢弃；`next_poll_at` 为下次轮询时刻（毫秒）。
 */
export interface SourceResponse {
  id: string;
  revision: number;
  owner_group_id: string;
  state: 'active' | 'paused' | 'blocked' | 'auth_error';
  generation: number;
  created_at: string;
  /** 分发被撤销的时间；有值后来源内容不再对外可见。 */
  distribution_revoked_at?: string;
  kind: 'git';
  provider: string;
  canonical_url: string;
  repository_identity: string;
  branch: string;
  credential_ref: string | null;
  next_poll_at: number;
  last_success_at?: string;
  last_error_code?: string | null;
  last_observed_commit?: string;
  last_observed_revision?: number;
  targets: SourceTargetResponse[];
}

/** 来源下的绑定目标，出现在来源详情；内嵌策略字段即该目标的自动发布策略。 */
export interface SourceTargetResponse extends Policy {
  id: string;
  source_id: string;
  asset_id: string;
  path: string;
  enabled: boolean;
  /** 解绑时间；有值的目标不再参与同步，但保留用于历史追溯。 */
  retired_at: string | null;
  applies_to: Applicability;
  created_at: string;
  last_intake_id?: string;
  slug: string;
  kind: 'skill' | 'mcp';
}

/**
 * 一次来源同步中单个目标的处理结果。`reused` 为真表示复用了同提交、同来源修订、
 * 同规则集且已终结的既有导入，不会重复生成版本。
 */
export interface SourceSyncTargetResponse {
  id: string;
  binding_id: string;
  intake_id: string;
  state: IntakeState;
  version_id?: string | null;
  error_code?: string | null;
  reused?: boolean;
}

/** 来源同步作业，出现在来源详情与运维视图；`attempt` 为重试次数，失败原因只保留错误码与消息。 */
export interface SourceSyncJobResponse {
  id: string;
  state: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
  attempt: number;
  created_at: string;
  finished_at?: string;
  last_error_code?: string;
  error_message?: string;
  result?: { origin_commit: string; source_revision?: number; targets: SourceSyncTargetResponse[] };
}
