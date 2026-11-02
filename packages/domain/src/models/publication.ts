import type { Applicability } from '../content.js';
import type { Policy, ScenarioDefinition, SourceConsent } from '../policy.js';
import type { IsoDateTime, VersionedRecord } from './base.js';

/**
 * 发布申请：把「某个版本的某次接收证据 + 冻结的分发策略」提交审核，证据在提交时冻结，
 * 审核期间任一环节变化都会把申请标记为 `stale` 而不是静默沿用。
 */
export interface PublicationRequestRecord extends VersionedRecord, Policy {
  proposed_scenarios?: ScenarioDefinition[];
  requires_api_key?: boolean;
  /** 提名已发布版本时的补充说明；被提名者与提名者不能是同一人，需要他人批准。 */
  nomination?: { release_id: string; reason: string };
  applies_to: Applicability;
  asset_id: string;
  version_id: string;
  /** 证据来源的接收记录；批准前会重新校验它仍与版本同源。 */
  source_intake_id: string;
  content_digest: string;
  policy_source_id: string;
  source_revision: number;
  source_consent: SourceConsent;
  scan_run_id: string;
  ruleset_version: string;
  /** 审批规则集的摘要；审核时与本实例当前值不一致即 409 `REVIEW_STALE`。 */
  approval_policy_digest: string;
  /** 提交时资产指向的发布记录；资产发布推进后申请即失效（避免基于旧基线合并）。 */
  base_release_id: string | null;
  /** 提交时的资产修订号，用于检测审核期间资产是否被改动。 */
  asset_revision: number;
  /** 冻结策略的规范化 JSON 原文，保留原始字节以便复核摘要而不是重算。 */
  canonical_policy_json: string;
  policy_digest: string;
  /** 历史导入：跳过「来源配置未变」类复核，按当时证据成立。 */
  historical: boolean;
  /** `stale` 表示上下文已变化、必须重新提交，不会自行恢复为 `pending`。 */
  state: 'pending' | 'approved' | 'rejected' | 'cancelled' | 'stale';
  submitted_by: string;
  created_at: IsoDateTime;
  /** 置为 `stale` 时的机器可读原因（如 `SOURCE_CONFIG_CHANGED`、`VERSION_REVOKED`）。 */
  stale_reason?: string;
  /** 作出决定的人；提名场景下必须与 `submitted_by` 不同。 */
  decision_by?: string;
  decision_reason?: string;
  decided_at?: IsoDateTime;
  /** 审核者逐条接受的 `warning` 级扫描命中及理由；未列出的 warning 会阻止批准。 */
  accepted_warnings?: { finding_id: string; reason: string }[];
}

/**
 * 一次正式发布，是内容可见性的唯一依据：资产通过 `current_release_id` 指向最新一条，
 * `release_seq` 在资产内单调递增，用于排序与识别并发发布。
 */
export interface ReleaseRecord extends Policy {
  requires_api_key?: boolean;
  applies_to: Applicability;
  id: string;
  asset_id: string;
  version_id: string;
  request_id: string;
  /** 资产内单调递增的发布序号，从 1 开始；不跨资产唯一。 */
  release_seq: number;
  policy_source_id: string;
  source_revision: number;
  /** 冻结策略的 `sha256:` 摘要，与申请记录一致，用于证明发布的就是审核过的策略。 */
  policy_digest: string;
  source_consent: SourceConsent;
  /** 实际执行发布的人；提名流程下与申请人是不同的人。 */
  published_by: string;
  published_at: IsoDateTime;
}
