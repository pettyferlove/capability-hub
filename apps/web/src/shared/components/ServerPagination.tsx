import { SelectField } from './SelectField.js';
import { TablePagination } from './TablePagination.js';

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
    <TablePagination
      label={label}
      summary={
        total
          ? `第 ${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} 条，共 ${total} 条`
          : '共 0 条'
      }
      page={page}
      pageCount={pages}
      onPrevious={!disabled && page > 1 ? () => onChange(page - 1, pageSize) : undefined}
      onNext={!disabled && page < pages ? () => onChange(page + 1, pageSize) : undefined}
    >
      <SelectField
        className="w-27 max-w-full"
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
    </TablePagination>
  );
}
