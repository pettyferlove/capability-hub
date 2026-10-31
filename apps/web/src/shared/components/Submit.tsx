import { btnStyles, btnPrimaryStyles, spinStyles } from '../styles/recipes.js';
import { cn } from '../styles/cn.js';
import { LoaderCircle } from '../icons/lucide.js';
import type { ReactNode } from 'react';

export function Submit({
  busy,
  children,
  ...props
}: {
  busy?: boolean;
  children: ReactNode;
  disabled?: boolean;
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
