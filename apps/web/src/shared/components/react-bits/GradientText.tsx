import type { ReactNode } from 'react';
import { gradientTextStyles } from './styles.js';

/** 渐变只使用主题前景色；系统减少动态效果时保留静态文字。 */
export function GradientText({ children }: { children: ReactNode }) {
  return <span className={gradientTextStyles}>{children}</span>;
}
