import {
  dataTableStyles,
  tableToolbarStyles,
  tableSearchStyles,
  tableWrapStyles,
  tableEmptyStyles,
} from '../styles/recipes.js';
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
export function DataTable({
  label,
  children,
}: {
  label: string;
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
    <div className={dataTableStyles}>
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
