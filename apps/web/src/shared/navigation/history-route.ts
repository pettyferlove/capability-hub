export type HubPage = 'discover' | 'publish' | 'review' | 'connect' | 'account' | 'login';

export interface HubRoute {
  page: HubPage;
  asset?: string;
  query: string;
}

/** 页面路径与 API、静态资源路径分别识别。 */
export function isPagePath(pathname: string): boolean {
  return (
    pathname === '/' ||
    /^\/(?:discover|publish|review|connect|account|login)\/?$/.test(pathname) ||
    /^\/asset\/[^/]+\/?$/.test(pathname)
  );
}

/** 资源标识只解码一次，非法路径回到可用的目录页面。 */
export function parseHistoryRoute(pathname: string, search = ''): HubRoute {
  const path = pathname.replace(/\/+$/, '') || '/';
  const query = search.replace(/^\?/, '');
  const assetMatch = /^\/asset\/([^/]+)$/.exec(path);
  if (assetMatch) {
    try {
      const asset = decodeURIComponent(assetMatch[1]);
      return asset ? { page: 'discover', asset, query } : { page: 'discover', query: '' };
    } catch {
      return { page: 'discover', query: '' };
    }
  }
  if (path === '/' || path === '/discover') return { page: 'discover', query };
  return ['/publish', '/review', '/connect', '/account', '/login'].includes(path)
    ? { page: path.slice(1) as HubPage, query }
    : { page: 'discover', query: '' };
}

export function pageHref(page: HubPage, values: Record<string, string | undefined> = {}): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) if (value) query.set(key, value);
  return '/' + page + (query.size ? '?' + query.toString() : '');
}

export function assetHref(slug: string): string {
  return '/asset/' + encodeURIComponent(slug);
}

export function loginHref(returnTo = '/discover'): string {
  return pageHref('login', { return_to: returnTo });
}

/** 登录后只返回已知本地页面，保留详情与筛选条件。 */
export function loginReturnPath(query: string): string {
  const target = new URLSearchParams(query).get('return_to') ?? '/discover';
  if (!target.startsWith('/') || target.startsWith('//') || target.includes('\\'))
    return '/discover';
  const pathname = target.split(/[?#]/)[0];
  return isPagePath(pathname) && parseHistoryRoute(pathname).page !== 'login'
    ? target
    : '/discover';
}

export const publicationStates = ['pending', 'approved', 'rejected', 'stale', 'cancelled'] as const;
export type PublicationStateFilter = (typeof publicationStates)[number];

export function reviewLocation(query: string): { state: PublicationStateFilter; request: string } {
  const values = new URLSearchParams(query);
  const requested = values.get('state');
  return {
    state: publicationStates.includes(requested as PublicationStateFilter)
      ? (requested as PublicationStateFilter)
      : 'pending',
    request: values.get('request') ?? '',
  };
}
