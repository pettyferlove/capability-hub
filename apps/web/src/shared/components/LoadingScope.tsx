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

/** 导航时重置加载计时，保留页面组件与已有数据。 */
export function LoadingScope({ scopeKey, children }: { scopeKey?: string; children: ReactNode }) {
  const delay = useMemo(createLoadingDelay, [scopeKey]);
  return <LoadingContext.Provider value={delay}>{children}</LoadingContext.Provider>;
}

export function useLoadingDelay(active = true) {
  const scope = useContext(LoadingContext);
  const delay = useMemo(() => scope ?? createLoadingDelay(), [scope]);
  const visible = useSyncExternalStore(delay.subscribe, delay.getSnapshot, hidden);
  useEffect(() => {
    if (active) return delay.begin();
  }, [delay, active]);
  return active && visible;
}
