import { useReducedMotion } from 'motion/react';
import { useEffect, useState } from 'react';

const glyphs = '#%&*+=<>/0123456789ABCDEF';
const frames = 10;

/**
 * 首次渲染直接显示文字；`text` 变化时从左到右逐字解码到新文字，乱码由帧序号确定性生成，
 * 渲染保持纯函数。减少动态效果时直接替换。
 */
export function DecryptedText({ text }: { text: string }) {
  const reduceMotion = useReducedMotion();
  const [previous, setPrevious] = useState(text);
  const [frame, setFrame] = useState(frames);
  if (previous !== text) {
    setPrevious(text);
    setFrame(reduceMotion ? frames : 0);
  }

  useEffect(() => {
    if (frame >= frames) return;
    const timer = window.setTimeout(() => setFrame(frame + 1), 35);
    return () => window.clearTimeout(timer);
  }, [frame]);

  if (frame >= frames) return text;
  const characters = Array.from(text);
  const revealed = Math.floor((frame / frames) * characters.length);
  return characters
    .map((character, index) =>
      index < revealed || character === ' '
        ? character
        : glyphs[(index * 7 + frame * 13) % glyphs.length],
    )
    .join('');
}
