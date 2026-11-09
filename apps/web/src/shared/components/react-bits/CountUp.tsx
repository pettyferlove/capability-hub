import {
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
  type AnimationPlaybackControls,
} from 'motion/react';
import { useEffect, useRef } from 'react';

/**
 * 数字首次进入视口时从 0 滚动到目标值，之后数据刷新只从当前显示值过渡到新值；
 * 减少动态效果时直接显示目标值。`format` 需保持引用稳定，中间帧先取整再格式化。
 */
export function CountUp({
  value,
  format = String,
}: {
  value: number;
  format?: (value: number) => string;
}) {
  const reduceMotion = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const seen = useRef(false);
  const count = useMotionValue(reduceMotion ? value : 0);
  const text = useTransform(count, (latest) => format(Math.round(latest)));

  useEffect(() => {
    const node = ref.current;
    if (reduceMotion || !node) {
      count.set(value);
      return;
    }
    let controls: AnimationPlaybackControls | undefined;
    const run = () => {
      seen.current = true;
      controls = animate(count, value, { duration: 0.9, ease: [0.22, 1, 0.36, 1] });
    };
    if (seen.current) {
      run();
      return () => controls?.stop();
    }
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      run();
    });
    observer.observe(node);
    return () => {
      observer.disconnect();
      controls?.stop();
    };
  }, [count, reduceMotion, value]);

  return <motion.span ref={ref}>{text}</motion.span>;
}
