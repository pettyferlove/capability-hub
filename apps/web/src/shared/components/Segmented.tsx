import { segmentedStyles, segmentedIndicatorStyles, kfocusStyles } from '../styles/recipes.js';
import { cn } from '../styles/cn.js';
import { motion, useReducedMotion } from 'motion/react';
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

import { contentTransition } from '../motion/transitions.js';

interface Highlight {
  x: number;
  y: number;
  width: number;
  height: number;
  animate: boolean;
}
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  id,
}: {
  options: { id: T; label: ReactNode }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  id: string;
}) {
  const reduceMotion = useReducedMotion();
  const group = useRef<HTMLDivElement>(null);
  const previousValue = useRef(value);
  const [highlight, setHighlight] = useState<Highlight | null>(null);
  useLayoutEffect(() => {
    const element = group.current;
    if (!element) return;
    const changed = previousValue.current !== value;
    previousValue.current = value;
    const measure = (animate: boolean) => {
      const selected = element.querySelector<HTMLButtonElement>('[aria-checked="true"]');
      if (!selected) {
        setHighlight(null);
        return;
      }
      const next = {
        x: selected.offsetLeft,
        y: selected.offsetTop,
        width: selected.offsetWidth,
        height: selected.offsetHeight,
      };
      setHighlight((current) =>
        current &&
        current.x === next.x &&
        current.y === next.y &&
        current.width === next.width &&
        current.height === next.height
          ? current
          : { ...next, animate: !!current && animate },
      );
    };
    // 首次定位和尺寸变化直接对齐，选择变化才运行动画。
    measure(changed);
    const observer = new ResizeObserver(() => measure(false));
    observer.observe(element);
    element.querySelectorAll('button').forEach((button) => observer.observe(button));
    return () => observer.disconnect();
  }, [value, options]);
  return (
    <div
      ref={group}
      role="radiogroup"
      aria-label={label}
      data-segmented={id}
      className={cn(
        segmentedStyles,
        'relative inline-flex max-w-full flex-wrap gap-1 rounded-full p-1',
      )}
    >
      {highlight && (
        <motion.span
          initial={false}
          animate={{
            x: highlight.x,
            y: highlight.y,
            width: highlight.width,
            height: highlight.height,
          }}
          aria-hidden="true"
          className={cn(
            segmentedIndicatorStyles,
            'pointer-events-none absolute left-0 top-0 rounded-full',
          )}
          transition={highlight.animate && !reduceMotion ? contentTransition : { duration: 0 }}
        />
      )}
      {options.map((o) => {
        const on = o.id === value;
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            onKeyDown={(e) => {
              const index = options.findIndex((item) => item.id === o.id);
              let next: number;
              if (e.key === 'ArrowRight' || e.key === 'ArrowDown')
                next = (index + 1) % options.length;
              else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp')
                next = (index - 1 + options.length) % options.length;
              else if (e.key === 'Home') next = 0;
              else if (e.key === 'End') next = options.length - 1;
              else return;
              e.preventDefault();
              onChange(options[next].id);
              e.currentTarget.parentElement
                ?.querySelectorAll<HTMLButtonElement>('[role="radio"]')
                ?.[next]?.focus();
            }}
            onClick={() => onChange(o.id)}
            className={cn(
              kfocusStyles,
              'relative inline-flex min-h-8 cursor-pointer items-center justify-center rounded-full px-3 py-1.5 text-[12px] leading-5 transition-colors',
              on ? 'text-foreground' : 'text-muted hover:text-foreground',
            )}
          >
            <span className="relative z-10 inline-flex items-center justify-center gap-1.5 whitespace-nowrap">
              {o.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
