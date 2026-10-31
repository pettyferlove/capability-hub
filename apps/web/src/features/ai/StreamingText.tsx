import { useLayoutEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'motion/react';
import { AiText } from './AiText.js';
import { advanceStreamCursor } from './stream-text.js';

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
