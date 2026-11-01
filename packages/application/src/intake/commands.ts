import type { AssetKind } from '@capability-hub/domain/content';
/**
 * 网页上传接收的输入，来自 multipart 表单的元数据字段（`uploadIntakeRequestSchema` 解析），
 * 文件字节另行传入；仅 `upload` 类型来源可接收，Git 来源须走同步流程。
 */
export type ReceiveIntakeCommand = {
  /** SemVer 固定版本号，须在该资产上唯一；`existing` + `automatic` 时还会与版本建议比对。 */
  version_label: string;
  /** 上限 20 条，超出即拒绝而不是截断。 */
  keywords?: string[];
  /** 只对 Skill 有效，MCP 传入即 422/`NOT_SKILL`。 */
  requires_api_key?: boolean;
} &
  /**
   * 新建资产：`slug` 1–64 位已被占用时 409/`SLUG_CONFLICT`；
   * 调用者需在 `owner_group_id` 上持有 `asset:create`。
   */
  (
    | { target: 'new'; slug: string; kind: AssetKind; owner_group_id: string }
    /**
     * 更新已有资产：调用者需是该资产的维护者（否则 403）。`version_mode` 为 `automatic` 表示
     * 版本号取自版本建议，提交时会用最新建议复核，已过期或不再大于最新版本则
     * 409/`VERSION_SUGGESTION_STALE`；`manual` 不做该复核。
     */
    | { target: 'existing'; asset_id: string; version_mode?: 'automatic' | 'manual' }
  );
/** 列表视图向外暴露的状态，含由关联发布申请推导出的状态，因此并非接收记录本身的 `state`。 */
export type IntakeStatus =
  | 'processing'
  | 'ready'
  | 'pending'
  | 'approved'
  | 'failed'
  | 'rejected'
  | 'stale'
  | 'cancelled'
  | 'deprecated'
  | 'blocked';
/**
 * 接收记录列表的过滤条件，来自 HTTP 的 `GET` query（`intakeListQuerySchema` 解析）；
 * 可见范围是调用者自己提交的记录加上其可维护资产的记录。
 */
export interface IntakeListQuery {
  /** 从 1 开始，契约层只放行正整数。 */
  page?: number;
  /** 契约层只放行 5/10/20/50，默认 5。 */
  page_size?: number;
  /** 空白切分后按词匹配，上限 200 字符。 */
  q?: string;
  /** `all` 表示不按状态过滤。 */
  state?: 'all' | IntakeStatus;
}
