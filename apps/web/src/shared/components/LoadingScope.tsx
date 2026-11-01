import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from 'react';

import { createLoadingDelay } from './loading-delay.js';

const LoadingContext = createContext<ReturnType<typeof createLoadingDelay> | null>(null);
const hidden = () => false;

/**
 * 加载计时器的作用域：`scopeKey` 变化会新建计时器，让每次导航重新判断「是否值得显示占位」，
 * 同时保留子树（页面组件与已有数据）不被卸载。同一作用域内的多个占位共享计时。
 */
export function LoadingScope({ scopeKey, children }: { scopeKey?: string; children: ReactNode }) {
  const delay = useMemo(createLoadingDelay, [scopeKey]);
  return <LoadingContext.Provider value={delay}>{children}</LoadingContext.Provider>;
}

/**
 * 订阅当前作用域的「占位是否该显示」；`active` 为假时立即返回假且不占计数，
 * 供已经有数据、正在后台刷新的场景跳过占位。返回假不代表加载结束，只代表还不该显示占位。
 */
export function useLoadingDelay(active = true) {
  const scope = useContext(LoadingContext);
  const delay = useMemo(() => scope ?? createLoadingDelay(), [scope]);
  const visible = useSyncExternalStore(delay.subscribe, delay.getSnapshot, hidden);
  useEffect(() => {
    if (active) return delay.begin();
  }, [delay, active]);
  return active && visible;
}
