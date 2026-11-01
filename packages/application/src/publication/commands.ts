import type { Applicability } from '@capability-hub/domain/content';
import type { Policy } from '@capability-hub/domain/policy';
/**
 * 提交发布的输入，来自 HTTP 的 JSON body（`submitPublicationRequestSchema` 解析）；
 * 服务端会把它连同来源同意、扫描证据一起冻结成规范 JSON，之后的审核只针对该快照。
 */
export interface SubmitPublicationCommand extends Policy {
  /** 提供内容证据的接收记录，必须与 `version_id` 的资产、摘要一致，否则 409/`INTAKE_MISMATCH`。 */
  source_intake_id: string;
  version_id: string;
  /** 检索维度，原样冻结进申请；提名的候选由审核方决定，不在此处重算。 */
  applies_to: Applicability;
  /** 仅 Skill 可声明，MCP 传入即 422/`NOT_SKILL`；缺省沿用接收记录或资产的取值。 */
  requires_api_key?: boolean;
  /** 1–2000 字符，同时写入来源同意与审计理由，作为分发授权依据。 */
  purpose: string;
  /**
   * 提交者看到的当前发布；与资产实际 `current_release_id` 不符即 409/`BASE_RELEASE_CHANGED`。
   * 这里用显式基线而不是修订号，因为受保护的只是“基于哪次发布”。
   */
  base_release_id: string | null;
}
/**
 * 审核决策的输入，来自 HTTP 的 JSON body（`publicationDecisionRequestSchema` 解析）；
 * 乐观并发由 `If-Match` 另行提供，不在本对象里。
 */
export interface PublicationDecisionCommand {
  decision: 'approve' | 'reject';
  /** ≤4000 字符；`reject` 时不得为空，否则 422/`COMMENT_REQUIRED`。 */
  comment: string;
  /** 申请冻结时算出的摘要原值，不符即 409/`POLICY_MISMATCH`，防止按过期证据决策。 */
  policy_digest: string;
  /**
   * 逐条接受本次扫描的 warning 级 finding，上限 100 条：
   * `finding_id` 必须来自当前扫描、不可重复，`reason` 不得为空（1–2000 字符），
   * 否则 422/`INVALID_WARNING_ACCEPTANCE`；漏接受任一告警则 422/`WARNING_ACCEPTANCE_REQUIRED`。
   */
  accepted_warnings: { finding_id: string; reason: string }[];
}
/**
 * 通用资源提名的输入，来自 HTTP 的 JSON body；调用者需能读取该发布，
 * 候选固定为 `category: 'general'` 且无场景，此处不允许覆盖。
 */
export interface NominateAssetCommand {
  /** 已被发布的发布记录；须仍是资产当前发布，否则 409/`BASE_RELEASE_CHANGED`。 */
  release_id: string;
  /** 1–2000 字符，写入冻结记录与 `publication.nominated` 审计，用于解释提名理由。 */
  reason: string;
}
