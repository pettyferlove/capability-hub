import { tablePaginationStyles, iconBtnStyles } from '../styles/recipes.js';
import { ChevronLeft, ChevronRight } from '../icons/lucide.js';
import { SelectField } from './SelectField.js';

/** 只改变请求页码和页大小，数据分页由服务端完成。 */
export function ServerPagination({
  label,
  page,
  pageSize,
  total,
  disabled,
  onChange,
}: {
  label: string;
  page: number;
  pageSize: number;
  total: number;
  disabled?: boolean;
  onChange: (page: number, pageSize: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <nav className={tablePaginationStyles} aria-label={label + '分页'}>
      <span role="status" aria-live="polite" aria-atomic="true">
        共 {total} 条 · {total ? (page - 1) * pageSize + 1 : 0}–{Math.min(page * pageSize, total)}{' '}
        条
      </span>
      <div>
        <SelectField
          aria-label={label + '每页条数'}
          value={String(pageSize)}
          disabled={disabled}
          onValueChange={(value) => onChange(1, Number(value))}
        >
          {[5, 10, 20, 50].map((size) => (
            <option key={size} value={size}>
              {size} 条 / 页
            </option>
          ))}
        </SelectField>
        <button
          type="button"
          className={iconBtnStyles}
          aria-label={label + '上一页'}
          disabled={disabled || page <= 1}
          onClick={() => onChange(page - 1, pageSize)}
        >
          <ChevronLeft size={16} />
        </button>
        <span>
          {page} / {pages}
        </span>
        <button
          type="button"
          className={iconBtnStyles}
          aria-label={label + '下一页'}
          disabled={disabled || page >= pages}
          onClick={() => onChange(page + 1, pageSize)}
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </nav>
  );
}
