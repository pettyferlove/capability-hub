import type { ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from '../icons/lucide.js';
import { tablePageButtonStyles, tablePaginationStyles } from '../styles/recipes.js';

/** 游标分页只显示当前页，翻页是否可用由持有数据的页面决定。 */
export function TablePagination({
  label,
  summary,
  page,
  pageCount,
  onPrevious,
  onNext,
  children,
}: {
  label: string;
  summary: string;
  page: number;
  pageCount?: number;
  onPrevious?: () => void;
  onNext?: () => void;
  children?: ReactNode;
}) {
  return (
    <nav className={tablePaginationStyles} aria-label={label + '分页'}>
      <span role="status" aria-live="polite" aria-atomic="true">
        {summary}
        <span className="sr-only">，第 {page} 页</span>
      </span>
      <div className="ml-auto flex min-w-0 max-w-full flex-wrap items-center justify-end gap-2">
        {children}
        <div className="inline-flex shrink-0 items-center rounded-lg border border-line bg-paper">
          <button
            type="button"
            className={tablePageButtonStyles}
            aria-label={label + '上一页'}
            title="上一页"
            disabled={!onPrevious}
            onClick={onPrevious}
          >
            <ChevronLeft size={16} aria-hidden="true" />
          </button>
          <span className="min-w-14 border-x border-line px-2 text-center leading-none whitespace-nowrap">
            {pageCount === undefined && '第 '}
            <span className="font-semibold text-ink" aria-current="page">
              {page}
            </span>
            {pageCount === undefined ? ' 页' : ' / ' + pageCount}
          </span>
          <button
            type="button"
            className={tablePageButtonStyles}
            aria-label={label + '下一页'}
            title="下一页"
            disabled={!onNext}
            onClick={onNext}
          >
            <ChevronRight size={16} aria-hidden="true" />
          </button>
        </div>
      </div>
    </nav>
  );
}
