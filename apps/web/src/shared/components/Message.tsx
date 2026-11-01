import { noticeStyles, noticeErrorStyles } from '../styles/recipes.js';
import { cn } from '../styles/cn.js';
import { AlertCircle } from '../icons/lucide.js';
import type { ReactNode } from 'react';

/**
 * 提示条；`error` 不只换配色，还把 `role` 从 `status` 提升为 `alert`——
 * 错误需要立刻被读屏打断朗读，成功提示不该打断。视觉与语义必须同步改，不能只改样式。
 */
export function Message({
  error,
  children,
  className = '',
}: {
  /** 是否为错误；真时用 `role="alert"` 与危险色，假时用 `role="status"`。 */
  error?: boolean;
  children: ReactNode;
  /** 追加类名，用于在特定容器里改边距或宽度。 */
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
