import type { IntakeResponse } from '@capability-hub/contracts/http';
import { stateLabel } from '../../shared/format/labels.js';
export function intakeLabel(i: IntakeResponse) {
  if (i.asset_lifecycle === 'deprecated') return '资产已弃用';
  if (i.asset_lifecycle === 'blocked') return '资产已封禁';
  if (i.state !== 'ready' || !i.publication) return stateLabel(i.state);
  return i.publication.state === 'approved' ? '已审核发布' : stateLabel(i.publication.state);
}
