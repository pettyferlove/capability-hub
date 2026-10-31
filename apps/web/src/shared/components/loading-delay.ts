export const LOADING_DELAY_MS = 180;

/** 连续加载阶段共用计时，内容和错误不等待占位显示。 */
export function createLoadingDelay() {
  let pending = 0;
  let visible = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const listeners = new Set<() => void>();
  function update(value: boolean) {
    if (visible === value) return;
    visible = value;
    for (const listener of listeners) listener();
  }
  return {
    getSnapshot: () => visible,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    begin() {
      pending++;
      if (!visible && timer === undefined)
        timer = setTimeout(() => {
          timer = undefined;
          if (pending > 0) update(true);
        }, LOADING_DELAY_MS);
      let released = false;
      return () => {
        if (released) return;
        released = true;
        pending--;
        if (pending !== 0) return;
        // 同一次 React 提交中，Suspense 与数据加载可交接同一计时。
        queueMicrotask(() => {
          if (pending !== 0) return;
          clearTimeout(timer);
          timer = undefined;
          update(false);
        });
      };
    },
  };
}
