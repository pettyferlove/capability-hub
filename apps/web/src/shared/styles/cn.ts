import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

// 自定义字号必须与颜色分组，否则 text-body 会被 text-ink 等颜色类误删。
const merge = extendTailwindMerge({
  extend: { theme: { text: ['title', 'section', 'body', 'label', 'caption'] } },
});

export function cn(...values: ClassValue[]): string {
  return merge(clsx(values));
}
