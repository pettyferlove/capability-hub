/**
 * 推荐开关的输入，来自 HTTP 的 JSON body；版本可读性由服务端再校验，
 * 不信任 body 里的任何归属信息。
 */
export interface RecommendationCommand {
  /** 必须是当前用户可读的版本，否则按不存在处理（404），不区分“无权”与“不存在”。 */
  version_id: string;
  /** 目标状态而非增量操作：重复提交同一状态不会产生额外记录或审计。 */
  recommended: boolean;
}

/**
 * 反馈提交的输入，来自 HTTP 的 JSON body；字段级长度限制由契约层校验，业务约束在此再校验。
 */
export interface AssetFeedbackCommand {
  /** 被反馈的版本，提交者必须能读取它，否则 404。 */
  version_id: string;
  /** 客户端生成，1–200 字符；与服务端内容摘要绑定，同键不同内容 → 409/`IDEMPOTENCY_CONFLICT`。 */
  idempotency_key: string;
  kind: 'defect' | 'capability_gap' | 'suggestion';
  /** 一句话摘要，≤160 字符。 */
  title: string;
  /** 复现场景与期望/实际表现；三者均为必填，否则反馈不可用。 */
  scenario: string;
  expected: string;
  actual: string;
  location: string;
  reproduction: string;
  evidence: string;
  suggestion: string;
  /** 是否阻塞使用，用于三选一之外的优先级判断。 */
  blocking: boolean;
  /** 必须是字面 `true`：确认已取得上报授权后才允许落库，否则 422/`FEEDBACK_CONSENT_REQUIRED`。 */
  consent: true;
}
/**
 * 反馈处理状态变更的输入，来自 HTTP 的 JSON body，只能由维护者调用；
 * 每小时 20 条的限额只约束提交，不约束处理。
 */
export interface AssetFeedbackUpdateCommand {
  /** 读取时的反馈 `revision`，不匹配即 409/`REVISION_CONFLICT`，避免覆盖他人处理。 */
  revision: number;
  status: 'pending' | 'in_progress' | 'resolved' | 'declined';
  /** 进入 `resolved`/`declined` 时必须非空，否则 422/`RESOLUTION_REQUIRED`。 */
  resolution: string;
  /** 仅在 `resolved` 且属于同一资产时允许，否则 422/`INVALID_FIXED_VERSION`。 */
  fixed_version_id: string | null;
}
