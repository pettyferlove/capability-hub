import { isPagePath, parseHistoryRoute } from './history-route.js';

export const navigationEvent = 'hub:navigation';

/** 仅处理同源页面链接，片段保留原生文档导航。 */
export function internalPageHref(href: string, base: string): string | undefined {
  try {
    const url = new URL(href, base);
    const current = new URL(base);
    if (url.origin !== current.origin || url.hash || !isPagePath(url.pathname)) return;
    return url.pathname + url.search;
  } catch {
    return;
  }
}

interface NavigationHost {
  location: Pick<Location, 'href' | 'pathname' | 'search'>;
  history: Pick<History, 'pushState' | 'replaceState' | 'state'>;
  dispatchEvent: (event: Event) => boolean;
}

export function navigate(
  href: string,
  options: { replace?: boolean } = {},
  host: NavigationHost = window,
): void {
  const target = internalPageHref(href, host.location.href);
  if (!target || target === host.location.pathname + host.location.search) return;
  const currentAsset = parseHistoryRoute(host.location.pathname).asset;
  const targetAsset = parseHistoryRoute(target.split('?')[0]).asset;
  const background = targetAsset
    ? currentAsset
      ? assetBackground(host.history.state)
      : host.location.pathname + host.location.search
    : undefined;
  const state = background ? { asset_background: background } : null;
  if (options.replace || (currentAsset && targetAsset))
    host.history.replaceState(state, '', target);
  else host.history.pushState(state, '', target);
  host.dispatchEvent(new Event(navigationEvent));
}

export function shouldHandleLink(
  event: {
    defaultPrevented: boolean;
    button: number;
    metaKey: boolean;
    ctrlKey: boolean;
    shiftKey: boolean;
    altKey: boolean;
  },
  target: string,
  download: boolean,
): boolean {
  return (
    !event.defaultPrevented &&
    event.button === 0 &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey &&
    (!target || target === '_self') &&
    !download
  );
}

/** 普通页面点击使用 History，组合键点击与下载交给浏览器。 */
export function handlePageLink(event: MouseEvent): void {
  const element = event.target instanceof Element ? event.target.closest('a[href]') : null;
  if (
    !(element instanceof HTMLAnchorElement) ||
    !shouldHandleLink(event, element.target, element.hasAttribute('download'))
  )
    return;
  const href = element.getAttribute('href');
  const target = href ? internalPageHref(href, window.location.href) : undefined;
  if (!target) return;
  event.preventDefault();
  navigate(target);
}

/** 详情保留站内来源页面，刷新与历史导航仍能恢复原入口。 */
export function assetBackground(state: unknown): string | undefined {
  if (!state || typeof state !== 'object' || !('asset_background' in state)) return;
  const value = state.asset_background;
  if (
    typeof value !== 'string' ||
    !value.startsWith('/') ||
    value.startsWith('//') ||
    value.includes('\\') ||
    value.includes('#')
  )
    return;
  const pathname = value.split('?')[0];
  if (!isPagePath(pathname) || parseHistoryRoute(pathname).asset) return;
  return value;
}

export function appRoute(pathname: string, search: string, state: unknown) {
  const route = parseHistoryRoute(pathname, search);
  const background = route.asset ? assetBackground(state) : undefined;
  if (!background) return route;
  const index = background.indexOf('?');
  const base = parseHistoryRoute(
    index < 0 ? background : background.slice(0, index),
    index < 0 ? '' : background.slice(index),
  );
  return { ...base, asset: route.asset };
}

export function closeAsset() {
  if (assetBackground(window.history.state)) window.history.back();
  else navigate('/discover', { replace: true });
}
