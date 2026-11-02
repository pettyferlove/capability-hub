const pages = [
  'discover',
  'publish',
  'review',
  'connect',
  'account',
  'login',
  'operations',
] as const;

/** 页面名称用于站内导航；资源详情由所在页面承载。 */
export type HubPage = (typeof pages)[number];

/** 账号页签的地址独立于查看者是否持有身份管理权限。 */
export const accountPageTabs = ['profile', 'credentials', 'security', 'identity', 'roles'] as const;

const operationsPageTabs = ['overview', 'agents', 'usage', 'runtime', 'audit'] as const;

/** 运营页签可单独分享，读取权限由相应栏目检查。 */
export type OperationsTab = (typeof operationsPageTabs)[number];

/** 浏览器导航和静态页面服务共用同一份地址范围；账号和运营页签也是页面地址的一部分。 */
export function hubPageFor(href: string): HubPage | undefined {
  const path = href.split(/[?#]/, 1)[0];
  if (path === '/' || /^\/asset\/[^/]+\/?$/.test(path)) return 'discover';
  const page = pages.find((name) => path === '/' + name || path === '/' + name + '/');
  const tabs =
    page === 'account' ? accountPageTabs : page === 'operations' ? operationsPageTabs : undefined;
  if (!tabs) return page;
  const selected = new URLSearchParams(href.slice(path.length).split('#', 1)[0]).getAll('tab');
  if (selected.length === 0 || (selected.length === 1 && tabs.some((tab) => tab === selected[0])))
    return page;
}
