import { useEffect, useEffectEvent, useRef, useState, useSyncExternalStore } from 'react';
import { mergeProps, useFocusWithin, useHover } from 'react-aria';

function subscribeVisibility(listener: () => void) {
  document.addEventListener('visibilitychange', listener);
  return () => document.removeEventListener('visibilitychange', listener);
}

function pageVisible() {
  return document.visibilityState === 'visible';
}

/**
 * 计满 `seconds` 秒后调用 `onDismiss`。页面不可见、指针悬停或焦点位于挂载 `holdProps` 的元素内时暂停，
 * 恢复后按剩余时间继续，避免用户尚未看到或正要操作时提示消失。
 */
export function useAutoDismiss(enabled: boolean, seconds: number, onDismiss: () => void) {
  const visible = useSyncExternalStore(subscribeVisibility, pageVisible);
  const { hoverProps, isHovered } = useHover({});
  const [focused, setFocused] = useState(false);
  const { focusWithinProps } = useFocusWithin({ onFocusWithinChange: setFocused });
  const left = useRef(seconds * 1_000);
  const [remaining, setRemaining] = useState(enabled ? seconds : undefined);
  const running = enabled && visible && !isHovered && !focused;
  const dismiss = useEffectEvent(onDismiss);

  useEffect(() => {
    if (!running) return;
    const deadline = performance.now() + left.current;
    let timer: ReturnType<typeof setTimeout> | undefined;
    function tick() {
      const rest = deadline - performance.now();
      if (rest <= 0) {
        dismiss();
        return;
      }
      const whole = Math.ceil(rest / 1_000);
      setRemaining(whole);
      timer = setTimeout(tick, Math.ceil(rest - (whole - 1) * 1_000));
    }
    tick();
    return () => {
      clearTimeout(timer);
      left.current = Math.max(0, deadline - performance.now());
    };
  }, [running]);

  return { remaining, paused: !running, holdProps: mergeProps(hoverProps, focusWithinProps) };
}
