import { useEffect, useSyncExternalStore } from 'react';
import { checkWebBuild } from './client.js';
import { bundledWebBuild, webBuildUpdates } from './web-build.js';

/** 业务响应会记录新版；切回空闲标签页时无需等待下一次业务请求。 */
export function usePendingWebBuild() {
  const build = useSyncExternalStore(webBuildUpdates.subscribe, webBuildUpdates.getSnapshot);
  useEffect(() => {
    if (!bundledWebBuild) return;
    let checking = false;
    const checkOnReturn = () => {
      if (document.visibilityState !== 'visible' || checking) return;
      checking = true;
      void checkWebBuild()
        .catch(() => {
          // 离线时不打断页面，后续业务请求仍能发现更新。
        })
        .finally(() => {
          checking = false;
        });
    };
    document.addEventListener('visibilitychange', checkOnReturn);
    return () => document.removeEventListener('visibilitychange', checkOnReturn);
  }, []);
  return build;
}
