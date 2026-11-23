import type { IntakeResponse } from '@capability-hub/contracts/http';
import { stateLabel } from '../../shared/format/labels.js';

/** 资产状态优先，之后是本接收的显式申请；相同发布的校验结果不计入待提交。 */
export function intakeLabel(i: IntakeResponse) {
  if (i.asset_lifecycle === 'deprecated') return '资产已弃用';
  if (i.asset_lifecycle === 'blocked') return '资产已封禁';
  if (i.state === 'ready' && i.publication)
    return i.publication.state === 'approved' ? '已审核发布' : stateLabel(i.publication.state);
  return stateLabel(i.matches_current_release ? 'unchanged' : i.state);
}
