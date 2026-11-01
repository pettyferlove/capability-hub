import { installBrowserLogging } from '@capability-hub/logging/browser';

let logging: ReturnType<typeof installBrowserLogging> | undefined;

/** 首次调用安装全局错误钩子；重复调用是幂等的，因此在入口调用一次即可，不必担心热更新重复安装。 */
export function startLogging(): void {
  logging ??= installBrowserLogging();
}

/**
 * 上报前端错误事件；未调用 {@link startLogging} 时是空操作（不会因此抛错）。
 *
 * @param event - 仅这两类：React 渲染错误与 HTTP 失败，便于后端按来源分流。
 * @param detail - 附加字段（状态码、错误码、请求 id 等），字段结构由安装的 logger 决定。
 */
export function reportError(
  event: 'react.error' | 'http.failed',
  detail: Parameters<ReturnType<typeof installBrowserLogging>['report']>[1],
): void {
  logging?.report(event, detail);
}
