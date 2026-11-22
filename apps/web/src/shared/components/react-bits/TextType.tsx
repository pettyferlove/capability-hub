import { useReducedMotion } from 'motion/react';
import { useEffect, useEffectEvent, useState } from 'react';

const typeDelay = 55;
const deleteDelay = 22;
const holdDelay = 2400;
const gapDelay = 420;

/**
 * 逐字打出 `text`，停留后删除并调用 `onNext` 换句；不传 `onNext` 时打完即停，光标随之隐藏。
 * `paused` 时整句停在原处，恢复后从停留阶段接着走。调用方用 `key` 换句，每句都从头打起；
 * 减少动态效果时直接显示整句。调用方负责对读屏隐藏。
 */
export function TextType({
  text,
  onNext,
  paused = false,
  className,
  cursorClassName,
}: {
  text: string;
  onNext?: () => void;
  paused?: boolean;
  className?: string;
  cursorClassName?: string;
}) {
  const reduceMotion = useReducedMotion();
  const [length, setLength] = useState(0);
  const [deleting, setDeleting] = useState(false);
  const characters = Array.from(text);
  const done = !onNext && length >= characters.length;
  const next = useEffectEvent(() => onNext?.());

  useEffect(() => {
    if (reduceMotion || done) return;
    if (paused) {
      setLength(characters.length);
      setDeleting(false);
      return;
    }
    const [delay, step] =
      !deleting && length < characters.length
        ? [typeDelay, () => setLength(length + 1)]
        : !deleting
          ? [holdDelay, () => setDeleting(true)]
          : length > 0
            ? [deleteDelay, () => setLength(length - 1)]
            : [gapDelay, next];
    const timer = window.setTimeout(step, delay);
    return () => window.clearTimeout(timer);
  }, [characters.length, deleting, done, length, paused, reduceMotion]);

  if (reduceMotion) return <span className={className}>{text}</span>;
  return (
    <span className={className}>
      {paused ? text : characters.slice(0, length).join('')}
      {!done && !paused && <span className={cursorClassName} />}
    </span>
  );
}
