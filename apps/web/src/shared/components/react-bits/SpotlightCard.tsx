import { useReducedMotion } from 'motion/react';
import type { MouseEvent, ReactNode } from 'react';
import { cn } from '../../styles/cn.js';
import { spotlightCardStyles } from './styles.js';

function followPointer(event: MouseEvent<HTMLElement>) {
  const card = event.currentTarget;
  const rect = card.getBoundingClientRect();
  card.style.setProperty('--spotlight-x', `${event.clientX - rect.left}px`);
  card.style.setProperty('--spotlight-y', `${event.clientY - rect.top}px`);
}

/** 聚光层不拦截内容交互，减少动态效果时不跟随指针；传入 `href` 时整张卡片渲染为链接。 */
export function SpotlightCard({
  children,
  className,
  href,
}: {
  children: ReactNode;
  className?: string;
  href?: string;
}) {
  const reduceMotion = useReducedMotion();
  const props = {
    className: cn(spotlightCardStyles, className),
    onMouseMove: reduceMotion ? undefined : followPointer,
  };
  return href ? (
    <a href={href} {...props}>
      {children}
    </a>
  ) : (
    <div {...props}>{children}</div>
  );
}
