import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

// 自定义字号必须与颜色分组，否则 text-body 会被 text-ink 等颜色类误删。
const merge = extendTailwindMerge({
  extend: { theme: { text: ['title', 'section', 'body', 'label', 'caption'] } },
});

/**
 * 合并 Tailwind 类名：先 `clsx` 展开条件类，再按 `tailwind-merge` 规则让后者覆盖前者。
 * 自定义字号（title/section/body/label/caption）必须注册进 `text` 分组，
 * 否则 `text-body` 会被 `text-ink` 这类颜色类当作同组冲突而误删。
 */
export function cn(...values: ClassValue[]): string {
  return merge(clsx(values));
}
