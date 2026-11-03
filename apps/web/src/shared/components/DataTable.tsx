import {
  dataTableStyles,
  tableToolbarStyles,
  tableSearchStyles,
  tableWrapStyles,
  tableEmptyStyles,
} from '../styles/recipes.js';
import { cn } from '../styles/cn.js';
import { Search } from '../icons/lucide.js';
import {
  Children,
  cloneElement,
  isValidElement,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';

function plain(node: ReactNode): string {
  return Children.toArray(node)
    .map((n) =>
      isValidElement<{ children?: ReactNode }>(n)
        ? plain(n.props.children)
        : typeof n === 'string' || typeof n === 'number'
          ? String(n)
          : '',
    )
    .join(' ');
}

/**
 * 轻量表格外壳：在客户端对 `tbody` 内已渲染的文案做子串过滤，并为空结果补一行占位。
 * 因为过滤基于已渲染内容，分页或服务端筛选仍然有效——它只缩小当前这一页；
 * 搜索框在超过 10 行或已有输入时才出现，避免小表被工具栏挤占。
 */
export function DataTable({
  label,
  children,
}: {
  /** 表格名，同时用于标题、`aria-label` 与搜索框的无障碍名称。 */
  label: string;
  /** 必须是单个 `<table>`；列数按 `thead` 首行各单元格的 `colSpan` 累加（缺省 1），用于让空态占满整行。 */
  children: ReactElement<React.TableHTMLAttributes<HTMLTableElement>>;
}) {
  const [query, setQuery] = useState('');
  const sections = Children.toArray(children.props.children),
    body = sections.find((n) => isValidElement(n) && n.type === 'tbody') as ReactElement<{
      children?: ReactNode;
    }>;
  const header = sections.find((node) => isValidElement(node) && node.type === 'thead') as
    ReactElement<{ children?: ReactNode }> | undefined;
  const headerRow = Children.toArray(header?.props.children).find(isValidElement) as
    ReactElement<{ children?: ReactNode }> | undefined;
  const columns =
    Children.toArray(headerRow?.props.children).reduce<number>(
      (count, cell) =>
        count + (isValidElement<{ colSpan?: number }>(cell) ? (cell.props.colSpan ?? 1) : 0),
      0,
    ) || 1;
  const rows = Children.toArray(body?.props.children).filter(isValidElement),
    filtered = rows.filter((r) => plain(r).toLowerCase().includes(query.trim().toLowerCase()));
  return (
    <div
      className={cn(
        dataTableStyles,
        filtered.length === 0 && 'max-[760px]:[&_table]:min-w-0 max-[360px]:[&_th]:px-2',
      )}
    >
      <div className={tableToolbarStyles}>
        <span>
          {label}
          <small role="status" aria-live="polite" aria-atomic="true">
            {query.trim() ? `${filtered.length} / ${rows.length}` : rows.length} 条记录
          </small>
        </span>
        {(rows.length > 10 || query) && (
          <label className={tableSearchStyles}>
            <Search size={15} />
            <input
              type="search"
              aria-label={'搜索' + label}
              placeholder="搜索记录…"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
              }}
            />
          </label>
        )}
      </div>
      <div className={tableWrapStyles} tabIndex={0} role="region" aria-label={label + '表格'}>
        {cloneElement(
          children,
          { 'aria-label': label },
          sections.map((section, index) =>
            section === body
              ? cloneElement(
                  body,
                  { key: index },
                  filtered.length ? (
                    filtered
                  ) : (
                    <tr>
                      <td colSpan={columns} className={tableEmptyStyles}>
                        {query.trim() ? '没有匹配的记录' : '暂无记录'}
                      </td>
                    </tr>
                  ),
                )
              : section,
          ),
        )}
      </div>
    </div>
  );
}
