import { useReducedMotion } from 'motion/react';
import type { ReactNode } from 'react';
import { cn } from '../../styles/cn.js';
import { spotlightCardStyles } from './styles.js';

/** 聚光层不拦截内容交互，减少动态效果时不跟随指针。 */
export function SpotlightCard({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();
  return (
    <div
      className={cn(spotlightCardStyles, className)}
      onMouseMove={
        reduceMotion
          ? undefined
          : (event) => {
              const card = event.currentTarget;
              const rect = card.getBoundingClientRect();
              card.style.setProperty('--spotlight-x', `${event.clientX - rect.left}px`);
              card.style.setProperty('--spotlight-y', `${event.clientY - rect.top}px`);
            }
      }
    >
      {children}
    </div>
  );
}
