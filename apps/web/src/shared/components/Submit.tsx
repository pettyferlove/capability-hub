import { btnStyles, btnPrimaryStyles, spinStyles } from '../styles/recipes.js';
import { cn } from '../styles/cn.js';
import { LoaderCircle } from '../icons/lucide.js';
import type { ReactNode } from 'react';

/**
 * 提交按钮：`busy` 时不只换图标，还会禁用按钮并置 `aria-busy`，
 * 因此连续点击不会重复提交（防抖由状态驱动，不是节流）。
 */
export function Submit({
  busy,
  children,
  ...props
}: {
  /** 提交进行中；为真时自动禁用，调用方无需再传 `disabled`。 */
  busy?: boolean;
  children: ReactNode;
  disabled?: boolean;
  form?: string;
  type?: 'button' | 'submit';
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      {...props}
      disabled={busy || props.disabled}
      aria-busy={busy || undefined}
      className={cn(btnStyles, btnPrimaryStyles, props.className ?? '')}
    >
      {busy ? <LoaderCircle size={16} className={spinStyles} /> : null}
      {children}
    </button>
  );
}
