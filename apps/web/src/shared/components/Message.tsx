import { noticeStyles, noticeErrorStyles } from '../styles/recipes.js';
import { cn } from '../styles/cn.js';
import { AlertCircle } from '../icons/lucide.js';
import type { ReactNode } from 'react';

export function Message({
  error,
  children,
  className = '',
}: {
  error?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      role={error ? 'alert' : 'status'}
      className={cn(noticeStyles, error ? noticeErrorStyles : '', className)}
    >
      <AlertCircle size={17} />
      <div>{children}</div>
    </div>
  );
}
