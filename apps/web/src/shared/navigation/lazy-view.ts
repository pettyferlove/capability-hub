import { createElement, lazy, type ComponentType } from 'react';
import { checkWebBuild } from '../api/client.js';
import { bundledWebBuild } from '../api/web-build.js';
import { Loading } from '../components/Loading.js';

const recoveries = new WeakMap<object, Promise<boolean>>();

/** 探测期间若用户已离开失败的页面，不得刷新新页面。 */
export function watchPreloadErrors(reload = () => location.reload()) {
  if (!bundledWebBuild) return;
  let check: { target: string; result: Promise<boolean> } | undefined;
  async function recover(target: string): Promise<boolean> {
    try {
      const build = await checkWebBuild();
      if (!build || build === bundledWebBuild || location.href !== target) return false;
      const key = `capability-hub:preload-reload:${build}`;
      if (window.sessionStorage.getItem(key)) return false;
      window.sessionStorage.setItem(key, '1');
      reload();
      return true;
    } catch {
      return false;
    }
  }

  function onPreloadError(event: Event) {
    const error = 'payload' in event ? event.payload : undefined;
    if (!error || typeof error !== 'object') return;
    const target = location.href;
    if (check?.target !== target) {
      const result = recover(target);
      check = { target, result };
      void result.then((reloading) => {
        if (!reloading && check?.result === result) check = undefined;
      });
    }
    recoveries.set(error, check.result);
  }

  window.addEventListener('vite:preloadError', onPreloadError);
  return () => window.removeEventListener('vite:preloadError', onPreloadError);
}

function ReloadingView() {
  return createElement(Loading, { label: '正在刷新页面…' });
}

/** Vite 同步派发错误；不取消事件，由懒加载等待探测，未刷新时继续抛出原错误。 */
export function lazyView<Props extends object>(
  load: () => Promise<{ default: ComponentType<Props> }>,
) {
  return lazy(async () => {
    try {
      return await load();
    } catch (error) {
      if (error && typeof error === 'object' && (await recoveries.get(error)))
        return { default: ReloadingView };
      throw error;
    }
  });
}
