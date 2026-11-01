import { useLayoutEffect, useRef } from 'react';
import { useReducedMotion } from 'motion/react';
import { Check } from '../../shared/icons/lucide.js';
import type { ReviewOrigin } from '../ai/quick-review.js';

/** 单条草稿字段的采纳结果，`result` 与 `field` 一起决定回执文案与是否播放落位动画。 */
export interface DraftChange {
  field: 'category' | 'keywords' | 'purpose';
  label: string;
  value: string;
  result: '已填入' | '保留手动填写' | '已有相同内容' | '已达关键词上限';
}

/**
 * 草稿核对回执：只有 `origin` 变化时才播放落位动画（同一来源重复渲染会被 `played` 挡掉），
 * 把「已填入」的值从 `origin` 坐标飞到对应 `data-draft-field` 控件或 `data-landing` 落点；
 * 系统开启减少动效时只记录已播放。回执本身不提交任何内容。
 */
export function DraftReceipt({
  origin,
  changes,
  visible,
}: {
  visible: boolean;
  origin: ReviewOrigin;
  changes: DraftChange[];
}) {
  const receipt = useRef<HTMLDivElement>(null);
  const played = useRef<ReviewOrigin | null>(null);
  const reduce = useReducedMotion();
  useLayoutEffect(() => {
    const node = receipt.current;
    const form = node?.closest('form');
    if (!visible || played.current === origin || !form || !node) return;
    if (changes.length > 1) node.scrollIntoView?.({ block: 'nearest', behavior: 'instant' });
    if (reduce || !node.animate) {
      played.current = origin;
      return;
    }
    const frame = window.requestAnimationFrame(() => {
      played.current = origin;
    });
    const animations: Animation[] = [];
    const tokens: HTMLElement[] = [];
    const viewport = node.closest('[data-intake-scroll]')?.getBoundingClientRect();
    changes.forEach(({ field, value, result }, i) => {
      if (result !== '已填入') return;
      const control = form.querySelector<HTMLElement>(`[data-draft-field="${field}"]`);
      const bounds = control?.getBoundingClientRect();
      const target =
        bounds &&
        bounds.top >= Math.max(0, viewport?.top ?? 0) &&
        bounds.top + 32 < Math.min(window.innerHeight, viewport?.bottom ?? window.innerHeight)
          ? control
          : node.querySelector<HTMLElement>(`[data-landing="${field}"]`);
      if (!target) return;
      const rect = target.getBoundingClientRect();
      const token = document.createElement('span');
      token.setAttribute('aria-hidden', 'true');
      token.className =
        'pointer-events-none fixed top-0 left-0 z-[90] max-w-36 truncate rounded-full bg-brand px-3 py-1.5 text-caption font-semibold text-on-brand shadow-overlay';
      token.textContent = value;
      document.body.appendChild(token);
      tokens.push(token);
      const endX = Math.min(rect.left + 8, window.innerWidth - token.offsetWidth - 8);
      const endY = rect.top + 6;
      const startX = origin.x - token.offsetWidth / 2;
      const startY = origin.y - 14;
      const flight = token.animate(
        [
          { transform: `translate(${startX}px, ${startY}px) scale(.85)`, opacity: 0 },
          { opacity: 1, offset: 0.15 },
          {
            transform: `translate(${(startX + endX) / 2}px, ${(startY + endY) / 2 - 30}px)`,
            opacity: 1,
            offset: 0.52,
          },
          { transform: `translate(${endX}px, ${endY}px) scale(.92)`, opacity: 0 },
        ],
        { duration: 920, delay: i * 180, easing: 'ease-in-out', fill: 'both' },
      );
      flight.onfinish = () => token.remove();
      animations.push(
        flight,
        target.animate(
          [
            { boxShadow: '0 0 0 0 transparent' },
            { boxShadow: '0 0 0 3px var(--brand)', offset: 0.3 },
            { boxShadow: '0 0 0 0 transparent' },
          ],
          { duration: 880, delay: 700 + i * 180 },
        ),
      );
    });
    return () => {
      window.cancelAnimationFrame(frame);
      animations.forEach((animation) => animation.cancel());
      tokens.forEach((token) => token.remove());
    };
  }, [origin, changes, reduce, visible]);
  return (
    <div ref={receipt} role="status" className="text-caption text-brand">
      <p className="mb-2 flex items-center gap-1.5 font-semibold text-brand">
        <Check size={14} />
        草稿已核对，尚未提交
      </p>
      <ul className="flex flex-wrap gap-x-3 gap-y-1">
        {changes.map(({ field, label, result }) => (
          <li key={field} data-landing={field} className="min-w-0 max-w-full">
            <span className="block text-muted-ink">
              {label} · {result}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
