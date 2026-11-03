import { queryRegionStyles, queryProgressStyles, queryContentStyles } from '../styles/recipes.js';
import { cn } from '../styles/cn.js';
import type { ReactNode } from 'react';
import { useLoadingDelay } from './LoadingScope.js';

/** 更新时保留集合区域，但前一筛选结果不可操作。 */
export function QueryRegion({
  children,
  label,
  loading,
  isPreviousData = false,
  showProgress = true,
  className = '',
}: {
  children: ReactNode;
  label: string;
  loading: boolean;
  isPreviousData?: boolean;
  showProgress?: boolean;
  className?: string;
}) {
  const visible = useLoadingDelay(loading && showProgress);
  return (
    <div
      className={cn(queryRegionStyles, className)}
      role="region"
      aria-label={label}
      aria-busy={loading}
    >
      {loading && showProgress && (
        <span className={queryProgressStyles} aria-hidden="true" data-loading-visible={visible} />
      )}
      <div className={queryContentStyles} inert={isPreviousData}>
        {children}
      </div>
    </div>
  );
}
