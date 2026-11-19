import { hubVersionHeaders } from '@capability-hub/contracts';

declare const __HUB_WEB_BUILD__: string;

/** 开发服务器没有构建号，不与服务端交付的 dist 比较。 */
export const bundledWebBuild =
  typeof __HUB_WEB_BUILD__ === 'string' ? __HUB_WEB_BUILD__ : undefined;
let updatedBuild: string | null = null;
const listeners = new Set<() => void>();

/** 旧构建的迟到响应不清除已发现的更新。 */
export function observeWebBuild(response: Response): string | null {
  if (!bundledWebBuild) return null;
  const build = response.headers.get(hubVersionHeaders.webBuild);
  if (build && build !== bundledWebBuild && build !== updatedBuild) {
    updatedBuild = build;
    for (const listener of listeners) listener();
  }
  return build;
}

/** 缓存收到的更新，避免响应先于应用外壳挂载时漏报。 */
export const webBuildUpdates = {
  getSnapshot: () => updatedBuild,
  subscribe: (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};
