/** 占位要等这么久才真正显示，用来跳过本地/内网瞬时完成的请求，避免闪一下加载态。 */
export const LOADING_DELAY_MS = 180;

/**
 * 引用计数的加载计时器：`begin()` 返回释放函数，多个并发加载共用同一个「是否显示占位」状态，
 * 计数归零后才隐藏，因此先完成的一方不会把仍在加载的占位提前撤掉。
 * 只有超过 {@link LOADING_DELAY_MS} 才把 `visible` 置真，数据与错误本身不受该延迟影响。
 */
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
