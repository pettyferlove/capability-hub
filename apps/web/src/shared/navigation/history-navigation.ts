import { hubPageFor } from '@capability-hub/contracts/web-pages';
import { parseHistoryRoute } from './history-route.js';

/**
 * 客户端导航完成后派发在 `window` 上的事件名。`pushState`/`replaceState` 本身不触发 `popstate`，
 * 订阅路由的组件必须同时监听这个事件才能感知跳转；`detail` 无负载，只用 `location` 取当前状态。
 */
export const navigationEvent = 'hub:navigation';

/** 仅处理同源页面链接，片段保留原生文档导航。 */
export function internalPageHref(href: string, base: string): string | undefined {
  try {
    const url = new URL(href, base);
    const current = new URL(base);
    if (url.origin !== current.origin || url.hash || !hubPageFor(url.pathname + url.search)) return;
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

/**
 * 站内跳转：非站内目标、带 hash 的目标、以及地址未变化时都直接返回（不产生新的历史项，避免点两次后退才离开）。
 * 打开详情时把来源页面写进 `history.state.asset_background`，刷新与后退仍能恢复原入口；
 * 详情之间互跳或传 `replace` 时使用 `replaceState`，因此详情抽屉不会把浏览历史撑爆。
 * 结束后派发 {@link navigationEvent}，调用方无需自行通知订阅者。
 *
 * @param options - `replace` 为真时替换当前历史项，用于登录后重定向、关闭详情等不应留下后退点的场景。
 * @param host - 可注入的 `location`/`history`，仅测试需要，默认取全局 `window`。
 */
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

/**
 * 判断一次点击是否应交给客户端路由：只接受左键、无修饰键、非下载、且目标为当前窗口。
 * 组合键点击（新标签页/新窗口）必须放行给浏览器，拦截会破坏用户的多开习惯。
 */
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
  if (!hubPageFor(value) || parseHistoryRoute(value.split('?')[0]).asset) return;
  return value;
}

/**
 * 合并地址与 `history.state` 得到最终视图：详情路径本身只表示 `page: 'discover'`，
 * 需要靠 `asset_background` 把被遮挡的页面还原回去，因此同一个 URL 在有无 state 时可能渲染成不同背景页。
 */
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

/**
 * 关闭详情：若由详情内跳转产生（存在 `asset_background`）就走 `history.back()` 保留前进栈，
 * 否则把地址替换回目录页，避免深链进入详情时留下一个空的后退入口。
 * 调用方不需要再自行改地址。
 */
export function closeAsset() {
  if (assetBackground(window.history.state)) window.history.back();
  else navigate('/discover', { replace: true });
}
