import { motion, useReducedMotion } from 'motion/react';
import { cn } from '../../styles/cn.js';
import { blurTextPieceStyles, blurTextStyles } from './styles.js';

const ease = [0.22, 1, 0.36, 1] as const;
// 汉字与全角标点逐字出现，其余连续字符按词出现，词内不会被拆开换行。
const segments =
  /\s+|[\p{Script=Han}\u3000-\u303f\uff00-\uffef]|[^\s\p{Script=Han}\u3000-\u303f\uff00-\uffef]+/gu;

/**
 * 挂载时逐字由模糊、透明、上移变清晰，只播放一次；读屏读取整段原文，动画片段对读屏隐藏。
 * `pieceClassName` 作用于每个片段，渐变文字需按片段着色，否则父级的 `background-clip: text`
 * 不覆盖带滤镜的子元素。减少动态效果时整段直接显示。
 */
export function BlurText({
  text,
  delay = 0,
  stagger = 0.032,
  spread,
  distance = 12,
  className,
  pieceClassName,
}: {
  text: string;
  /** 首字开始前的等待秒数，多行标题据此衔接。 */
  delay?: number;
  stagger?: number;
  /** 全部片段错开的总时长上限（秒），长段落按此压缩间隔。 */
  spread?: number;
  /** 起始上移的像素，模糊半径随之等比缩放。 */
  distance?: number;
  className?: string;
  pieceClassName?: string;
}) {
  const reduceMotion = useReducedMotion();
  if (reduceMotion)
    return (
      <span className={cn(blurTextStyles, className)}>
        <span className={pieceClassName}>{text}</span>
      </span>
    );
  const parts = text.match(segments) ?? [];
  const visible = parts.filter((part) => part.trim()).length;
  const interval =
    spread === undefined ? stagger : Math.min(stagger, spread / Math.max(1, visible));
  const blur = (distance * 5) / 6;
  let order = 0;
  return (
    <span className={cn(blurTextStyles, className)}>
      <span className="sr-only">{text}</span>
      {parts.map((part, index) =>
        part.trim() ? (
          <motion.span
            key={index}
            aria-hidden="true"
            className={cn(blurTextPieceStyles, pieceClassName)}
            initial={{ filter: `blur(${blur}px)`, opacity: 0, y: -distance }}
            animate={{
              filter: [`blur(${blur}px)`, `blur(${blur * 0.4}px)`, 'blur(0px)'],
              opacity: [0, 0.6, 1],
              y: [-distance, distance / 8, 0],
              transitionEnd: { filter: 'none' },
            }}
            transition={{
              duration: 0.62,
              times: [0, 0.55, 1],
              ease,
              delay: delay + order++ * interval,
            }}
          >
            {part}
          </motion.span>
        ) : (
          part
        ),
      )}
    </span>
  );
}
