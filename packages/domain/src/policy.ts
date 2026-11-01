/**
 * 资源的分发策略，随发布请求与发布记录一起冻结并参与 `policy_digest`，所以字段顺序与取值都会影响摘要。
 */
export interface Policy {
  /** `scenario` 与 `scenario_ids` 必须同时成立：分类为 `scenario` ⇔ 场景列表非空。 */
  category: 'general' | 'scenario' | 'uncategorized';
  /** 适用场景 id，最多 20 条且不可重复；引用对象必须仍处于启用状态。 */
  scenario_ids: string[];
  distribution: {
    /** 目前只有一种模式：分发必须有明确批准的受众。 */
    mode: 'approved_audience';
    /**
     * 1–100 条、不可重复；元素为 `public`、`organization`、`group:<uuid>` 或 `principal:<uuid>`。
     * `public` 与 `organization` 各自只能独占（不能与其他条目混用），组与用户可任意组合。
     */
    audience: string[];
  };
}

/**
 * 来源方对本次分发的授权确认，保存当时的承诺原文而不是外键引用，
 * 因此事后修改来源或团队都不会改变已发布版本上记录的授权范围。
 */
export interface SourceConsent {
  /** 作出授权的人；提名场景下此人不得为自己批准，审批链路据此做利益冲突回避。 */
  actor_id: string;
  /** 授权确认时间，UTC ISO 字符串。 */
  confirmed_at: string;
  /** 授权的权利依据（如内部授权、开源许可证），供审核者判断可否再分发。 */
  permission_basis: string;
  /** 本次分发目的，写入发布记录以支持事后追溯。 */
  purpose: string;
  /** 被授权内容的 `sha256:` 摘要；与版本 `content_digest` 不一致即视为授权与内容不匹配。 */
  content_digest: string;
  /** 授权时同意的受众范围，须与 {@link Policy} 的 `distribution.audience` 一致。 */
  audience: string[];
}
