import type { ReactNode } from 'react';
import { cn } from '../../styles/cn.js';
import {
  starBorderBottomStyles,
  starBorderStyles,
  starBorderSurfaceStyles,
  starBorderTopStyles,
} from './styles.js';

/**
 * 挂载时两束 `--brand` 光沿上、下描边反向扫过一次后熄灭，只留静态描边，适合宽而矮的容器；
 * `className` 作用于描边内的表面。减少动态效果与强制颜色模式下不扫光。
 */
export function StarBorder({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={starBorderStyles}>
      <div className={cn(starBorderSurfaceStyles, className)}>{children}</div>
      <span aria-hidden="true" className={starBorderTopStyles} />
      <span aria-hidden="true" className={starBorderBottomStyles} />
    </div>
  );
}
