import type { IntakeResponse } from '@capability-hub/contracts/http';
import { stateLabel } from '../../shared/format/labels.js';
/**
 * 入口标签是**有序覆盖**而非查表，优先级依次为：资产弃用、封禁、未 `ready` 或无 publication 时回退
 * {@link stateLabel}、publication 审核态。先命中的分支直接返回，因此后期状态不会覆盖前期结论。
 */
export function intakeLabel(i: IntakeResponse) {
  if (i.asset_lifecycle === 'deprecated') return '资产已弃用';
  if (i.asset_lifecycle === 'blocked') return '资产已封禁';
  if (i.state !== 'ready' || !i.publication) return stateLabel(i.state);
  return i.publication.state === 'approved' ? '已审核发布' : stateLabel(i.publication.state);
}
