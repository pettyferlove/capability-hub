import { useReducedMotion } from 'motion/react';
import { useEffect, useState } from 'react';

const typeDelay = 55;
const deleteDelay = 22;
const holdDelay = 2400;
const gapDelay = 420;

/**
 * 逐字打出 `texts` 里的句子，停留后删除并换下一句；只有一句时打完即停，光标随之隐藏。
 * 每次挂载都从第一句重新开始；减少动态效果时直接显示第一句。调用方负责对读屏隐藏。
 */
export function TextType({
  texts,
  className,
  cursorClassName,
}: {
  texts: string[];
  className?: string;
  cursorClassName?: string;
}) {
  const reduceMotion = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [length, setLength] = useState(0);
  const [deleting, setDeleting] = useState(false);
  const characters = Array.from(texts[index % texts.length] ?? '');
  const loop = texts.length > 1;
  const done = !loop && length >= characters.length;

  useEffect(() => {
    if (reduceMotion || done) return;
    const [delay, next] =
      !deleting && length < characters.length
        ? [typeDelay, () => setLength(length + 1)]
        : !deleting
          ? [holdDelay, () => setDeleting(true)]
          : length > 0
            ? [deleteDelay, () => setLength(length - 1)]
            : [
                gapDelay,
                () => {
                  setDeleting(false);
                  setIndex(index + 1);
                },
              ];
    const timer = window.setTimeout(next, delay);
    return () => window.clearTimeout(timer);
  }, [characters.length, deleting, done, index, length, reduceMotion]);

  if (reduceMotion) return <span className={className}>{texts[0]}</span>;
  return (
    <span className={className}>
      {characters.slice(0, length).join('')}
      {!done && <span className={cursorClassName} />}
    </span>
  );
}
