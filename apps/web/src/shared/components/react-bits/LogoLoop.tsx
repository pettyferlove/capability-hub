import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '../../styles/cn.js';
import { logoLoopFocusShift, logoLoopLayout, type LogoLoopLayout } from './logo-loop-layout.js';
import {
  logoLoopFadeStyles,
  logoLoopItemStyles,
  logoLoopListStyles,
  logoLoopStyles,
  logoLoopWrapStyles,
} from './styles.js';

const gap = 36;

/**
 * 一项只有一个可点击、可聚焦的 DOM 节点。平移由 Web Animations 驱动，悬停或键盘聚焦时
 * 原地暂停，离开后从同一位置续播。减少动态效果时保留静态列表，放不下就换行。
 */
export function LogoLoop({
  items,
  speed = 28,
  className,
}: {
  items: { key: string; node: ReactNode }[];
  speed?: number;
  className?: string;
}) {
  const root = useRef<HTMLDivElement>(null);
  const sequence = useRef<HTMLUListElement>(null);
  const signature = items.map((item) => item.key).join('\n');
  const [layout, setLayout] = useState<LogoLoopLayout | null>(null);
  const distance = useRef(0);

  useLayoutEffect(() => {
    const container = root.current;
    const list = sequence.current;
    if (!container || !list) return;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const measure = () => {
      if (motion.matches || speed <= 0 || typeof list.animate !== 'function') {
        setLayout(null);
        return;
      }
      const widths = Array.from(list.children, (item) => item.getBoundingClientRect().width);
      const next = logoLoopLayout(widths, container.clientWidth, gap);
      setLayout((prev) =>
        prev &&
        next &&
        prev.period === next.period &&
        prev.spacing === next.spacing &&
        prev.starts.length === next.starts.length &&
        prev.starts.every((x, i) => x === next.starts[i])
          ? prev
          : next,
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    for (const child of list.children) observer.observe(child);
    motion.addEventListener('change', measure);
    return () => {
      observer.disconnect();
      motion.removeEventListener('change', measure);
    };
  }, [signature, speed]);

  useLayoutEffect(() => {
    const container = root.current;
    const list = sequence.current;
    if (!layout || speed <= 0 || !container || list?.childElementCount !== layout.starts.length) {
      return;
    }
    const msPerPixel = 1000 / speed;
    const duration = layout.period * msPerPixel;
    // 同一时钟配合负延时对齐初始排版，换边只发生在视口外。
    const players = Array.from(list.children, (item, index) => {
      const from = layout.starts[index];
      const player = item.animate(
        [
          { transform: `translate3d(${from}px, 0, 0)` },
          { transform: `translate3d(${from - layout.period}px, 0, 0)` },
        ],
        { duration, delay: -from * msPerPixel, iterations: Infinity },
      );
      player.currentTime = (distance.current % layout.period) * msPerPixel;
      return player;
    });
    let visible = true;
    let hovered = container.matches(':hover') && window.matchMedia('(any-hover: hover)').matches;
    const sync = (active: Element | null) => {
      const modal = active?.closest('[aria-modal="true"]');
      const pause =
        !visible ||
        document.hidden ||
        hovered ||
        (container.contains(active) && active?.matches(':focus-visible')) ||
        (modal && !modal.contains(container));
      for (const player of players) {
        if (pause) {
          if (player.playState !== 'paused') player.pause();
        } else if (player.playState !== 'running') player.play();
      }
    };
    const focus = (active: Element | null) => {
      sync(active);
      if (!active || !container.contains(active) || !active.matches(':focus-visible')) return;
      const box = container.getBoundingClientRect();
      const item = active.getBoundingClientRect();
      const shift = logoLoopFocusShift(item.left - box.left, item.width, box.width);
      if (!shift) return;
      const time = Number(players[0].currentTime) + shift * msPerPixel;
      const next = ((time % duration) + duration) % duration;
      for (const player of players) player.currentTime = next;
    };
    const enter = () => {
      hovered = true;
      sync(document.activeElement);
    };
    const leave = () => {
      hovered = false;
      sync(document.activeElement);
    };
    const focusIn = (event: FocusEvent) =>
      focus(event.target instanceof Element ? event.target : null);
    const focusOut = (event: FocusEvent) => {
      if (!event.relatedTarget) sync(null);
    };
    const visibility = () => sync(document.activeElement);
    const observer = new IntersectionObserver((entries) => {
      visible = entries.some((entry) => entry.isIntersecting);
      visibility();
    });
    observer.observe(container);
    container.addEventListener('pointerenter', enter);
    container.addEventListener('pointerleave', leave);
    document.addEventListener('focusin', focusIn);
    document.addEventListener('focusout', focusOut);
    document.addEventListener('visibilitychange', visibility);
    focus(document.activeElement);
    return () => {
      distance.current = (Number(players[0].currentTime) / msPerPixel) % layout.period;
      for (const player of players) player.cancel();
      observer.disconnect();
      container.removeEventListener('pointerenter', enter);
      container.removeEventListener('pointerleave', leave);
      document.removeEventListener('focusin', focusIn);
      document.removeEventListener('focusout', focusOut);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [layout, signature, speed]);

  return (
    <div ref={root} className={cn(logoLoopStyles, layout && logoLoopFadeStyles, className)}>
      <ul
        ref={sequence}
        className={cn(logoLoopListStyles, !layout && logoLoopWrapStyles)}
        style={{ columnGap: layout?.spacing ?? gap }}
      >
        {items.map((item) => (
          <li key={item.key} className={logoLoopItemStyles}>
            {item.node}
          </li>
        ))}
      </ul>
    </div>
  );
}
