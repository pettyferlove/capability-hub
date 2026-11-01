import type { AuditActorSnapshot, AuditSubjectSnapshot } from '../audit.js';
import type { IsoDateTime } from './base.js';

/**
 * 审计事件记录，只追加、不更新也不删除；`action` 需在 `auditDefinitions` 注册才能正确分类。
 */
export interface AuditRecord {
  id: string;
  /** 事件发生时刻，UTC ISO 字符串；跨节点以它排序，不依赖写入顺序。 */
  occurred_at: IsoDateTime;
  /** 操作者 id，可为 `anonymous`/`system` 等保留值；与 `actor` 快照冗余保存。 */
  actor_id: string;
  /** 形如 `identity.login_failed` 的动作标识，登记的标签与分类见 `auditDefinitions`。 */
  action: string;
  /** 被操作对象的 id；具体类型由 `subject.kind` 决定。 */
  entity_id: string;
  result: 'success' | 'failure';
  /** 失败原因或补充说明的自由文本，只用于展示。 */
  reason: string;
  /** 附加事实，键值均会随事件冻结，不能放凭据或记录正文。 */
  metadata: Record<string, unknown>;
  /** 写入时的操作者快照，缺省时查询侧按 `actor_id` 回查并降级。 */
  actor?: AuditActorSnapshot;
  subject?: AuditSubjectSnapshot;
}
