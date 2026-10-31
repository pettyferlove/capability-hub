import { isPagePath } from './history-route.js';

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
  history: Pick<History, 'pushState' | 'replaceState'>;
  dispatchEvent: (event: Event) => boolean;
}

export function navigate(
  href: string,
  options: { replace?: boolean } = {},
  host: NavigationHost = window,
): void {
  const target = internalPageHref(href, host.location.href);
  if (!target || target === host.location.pathname + host.location.search) return;
  if (options.replace) host.history.replaceState(null, '', target);
  else host.history.pushState(null, '', target);
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
