import type { EpochMilliseconds, IsoDateTime } from './base.js';
import type { IntakeState } from './intake.js';

/**
 * 作业类型到入参结构的映射。入参在入队时冻结（含来源修订号等快照），
 * 因此同一作业重试时看到的是入队那一刻的参数，而不是最新配置。
 */
export interface JobInputMap {
  ai_execution: { execution_id: string };
  intake: Record<string, never>;
  rescan: { version_id: string };
  source_sync: { requested_by: string; source_revision: number };
}

/**
 * 作业类型（`JobRecord` 的判别式）。
 */
export type JobKind = keyof JobInputMap;

/**
 * 来源同步对单个绑定的处理结果：`reused` 为 true 表示复用了既有接收记录而没有重复产出，
 * 因此一次同步里出现复用是正常去重，不是错误。
 */
export interface SyncTargetResult {
  id: string;
  binding_id: string;
  intake_id: string;
  state: IntakeState;
  version_id?: string | null;
  error_code?: string | null;
  /** 命中同来源修订、同提交、同规则集的既有接收记录时置 true。 */
  reused?: boolean;
}

interface JobBase {
  id: string;
  aggregate_id: string;
  /** 状态机：`queued → running → succeeded|failed|cancelled`；失败的作业按 `attempt` 重新排队。 */
  state: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
  /** 已尝试次数，领取时递增，用于退避与上限判断。 */
  attempt: number;
  /** 最早可领取时刻 epoch 毫秒，配合失败退避使用。 */
  run_after: EpochMilliseconds;
  /** 租约代次，每次领取 `+1`；写回结果前必须与当前值一致，否则 409 `LEASE_LOST`。 */
  lease_epoch: number;
  /** 租约到期时刻 epoch 毫秒，领取时设为「当前 + 60 秒」；超时可被其他 worker 抢占。 */
  lease_until: EpochMilliseconds;
  /** 当前持有租约的 worker 标识，与 `lease_epoch` 一起校验归属。 */
  lease_owner?: string;
  /** 置位后持租约方应在下一个检查点停止，不再继续处理。 */
  cancel_requested: boolean;
  created_at: IsoDateTime;
  finished_at?: IsoDateTime;
  last_error_code?: string;
  error_message?: string;
  /** 作业产出快照，形状随 `kind` 变化，仅在成功时写入。 */
  result?: { origin_commit: string; source_revision?: number; targets: SyncTargetResult[] };
}

/**
 * 作业记录（按 `kind` 判别的联合类型）；`input` 与 `kind` 必须匹配，
 * 读取方先按 `kind` 收窄再使用入参。
 */
export type JobRecord = {
  [K in JobKind]: JobBase & { kind: K; input: JobInputMap[K] };
}[JobKind];
