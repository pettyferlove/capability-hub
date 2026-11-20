import type { OperationsTab } from '@capability-hub/contracts/web-pages';
import { pageHref } from '../../shared/navigation/history-route.js';

/** 运营子页独立授权，不要求同时持有审计、执行检查或平台反馈处理权限。 */
export function canOpenOperations(capabilities?: {
  can_ai_console: boolean;
  can_audit: boolean;
  can_manage_feedback: boolean;
}) {
  return !!(
    capabilities?.can_ai_console ||
    capabilities?.can_audit ||
    capabilities?.can_manage_feedback
  );
}

/** 运营中心的公开页面地址；只有总览省略 tab。 */
export function operationsHref(
  tab: OperationsTab,
  values: Record<string, string | undefined> = {},
) {
  return pageHref('operations', { tab: tab === 'overview' ? undefined : tab, ...values });
}
