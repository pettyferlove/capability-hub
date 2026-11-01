import { useLayoutEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'motion/react';
import { AiText } from './AiText.js';
import { advanceStreamCursor } from './stream-text.js';

/**
 * 逐字显示 SSE 增量文本；`live` 为假、用户偏好减少动效或标签页隐藏时直接落到全文，不做动画。
 *
 * 只有在下一段文本是已渲染内容的前缀时才继续打字，否则视为重排或替换并立即重绘；每帧间隔不足
 * 24ms 跳过，整段追赶上限 180ms，超过就直接补全文，避免长回答拖慢渲染。帧回调与卸载都会清理
 * `requestAnimationFrame`，不会在组件外继续更新状态。
 */
export function StreamingText({ text, live }: { text: string; live: boolean }) {
  const reducedMotion = useReducedMotion();
  const [visible, setVisible] = useState(text);
  const rendered = useRef(text);
  const target = useRef(text);
  const frame = useRef<number | undefined>(undefined);
  useLayoutEffect(() => {
    target.current = text;
    const publish = (value: string) => {
      rendered.current = value;
      setVisible(value);
    };
    if (!live || reducedMotion || document.hidden || !text.startsWith(rendered.current)) {
      if (frame.current !== undefined) cancelAnimationFrame(frame.current);
      frame.current = undefined;
      publish(text);
      return;
    }
    if (frame.current !== undefined || rendered.current === text) return;
    const started = performance.now();
    let previous = started;
    const tick = (now: number) => {
      if (now - previous >= 24) {
        const value = target.current;
        const end =
          now - started >= 180
            ? value.length
            : advanceStreamCursor(value, rendered.current.length, now - previous);
        publish(value.slice(0, end));
        previous = now;
      }
      frame.current = rendered.current === target.current ? undefined : requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
  }, [text, live, reducedMotion]);
  useLayoutEffect(
    () => () => {
      if (frame.current !== undefined) cancelAnimationFrame(frame.current);
    },
    [],
  );
  return <AiText text={visible || (live ? '正在组织内容…' : '')} />;
}
