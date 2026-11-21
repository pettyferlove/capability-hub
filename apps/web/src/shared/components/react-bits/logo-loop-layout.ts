/** 横条的一圈长度、均匀间距与各项从右缘进入时的平移量，单位为 CSS 像素。 */
export interface LogoLoopLayout {
  period: number;
  spacing: number;
  starts: number[];
}

/** 只在一行放不下时滚动。每项完全离开左缘后才回到右缘，不需要复制链接。 */
export function logoLoopLayout(
  widths: readonly number[],
  viewport: number,
  gap: number,
): LogoLoopLayout | null {
  const total = widths.reduce((sum, width) => sum + width, 0);
  if (!widths.length || viewport <= 0 || total + gap * (widths.length - 1) <= viewport) return null;

  // 最宽项换边时也必须在视口外；多出来的距离均摊到各项间隙，接缝处没有额外留白。
  const period = Math.max(total + gap * widths.length, viewport + Math.max(...widths));
  const spacing = (period - total) / widths.length;
  let left = 0;
  const starts = widths.map((width) => {
    const start = period - left - width;
    left += width + spacing;
    return start;
  });
  return { period, spacing, starts };
}

/** 已完整可见的焦点项不动；否则只平移到最近的可见边界，并给焦点轮廓留出空间。 */
export function logoLoopFocusShift(left: number, width: number, viewport: number) {
  const right = left + width;
  if (left >= 0 && right <= viewport) return 0;
  const inset = Math.min(4, Math.max(0, (viewport - width) / 2));
  return left < 0 || width >= viewport ? left - inset : right - viewport + inset;
}
