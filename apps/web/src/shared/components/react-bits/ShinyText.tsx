import type { ReactNode } from 'react';
import { shinyTextStyles } from './styles.js';

/** 挂载时以 `--brand` 光泽扫过一次，静止后保持 `--ink` 实色；减少动态效果时不扫光。 */
export function ShinyText({ children }: { children: ReactNode }) {
  return <span className={shinyTextStyles}>{children}</span>;
}
