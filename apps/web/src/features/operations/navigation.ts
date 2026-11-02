import type { OperationsTab } from '@capability-hub/contracts/web-pages';
import { pageHref } from '../../shared/navigation/history-route.js';

/** 子页读取权限独立，持有平台检查或审计权限即可进入相应区域。 */
export function canOpenOperations(capabilities?: { can_ai_console: boolean; can_audit: boolean }) {
  return !!(capabilities?.can_ai_console || capabilities?.can_audit);
}

/** 运营中心的公开页面地址；只有总览省略 tab。 */
export function operationsHref(
  tab: OperationsTab,
  values: Record<string, string | undefined> = {},
) {
  return pageHref('operations', { tab: tab === 'overview' ? undefined : tab, ...values });
}
