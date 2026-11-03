import { useEffect, useMemo, useState } from 'react';
import { operationsAgentApi, aiExecutionLedgerResponseSchema } from '@capability-hub/contracts';
import { useQuery } from '../../../shared/api/use-query.js';
import { SelectField } from '../../../shared/components/SelectField.js';
import { TablePagination } from '../../../shared/components/TablePagination.js';
import { QueryRegion } from '../../../shared/components/QueryRegion.js';
import { TableSkeleton } from '../../../shared/components/Skeleton.js';
import { operationsRevealStyles } from '../styles.js';
import { operationsHref } from '../navigation.js';
import { btnStyles, dataTableStyles, tableWrapStyles } from '../../../shared/styles/recipes.js';
import { cn } from '../../../shared/styles/cn.js';
import { ExecutionStatus } from '../../ai/ExecutionStatus.js';
import { operationLabels, statusLabels } from '../../ai/presentation.js';
import { controlStyles, scrollStyles } from '../../ai/styles.js';

/** 筛选应用于服务端可见集合，切换筛选从首页开始，打开详情保留当前页。 */
export function ExecutionLedger({ active, readOnly }: { active: boolean; readOnly: boolean }) {
  const [search, setSearch] = useState('');
  const [term, setTerm] = useState('');
  const [status, setStatus] = useState('');
  const [operation, setOperation] = useState('');
  const [cursors, setCursors] = useState<string[]>([]);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    if (search.trim() === term) return;
    const timer = window.setTimeout(() => {
      setTerm(search.trim());
      setCursors([]);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [search, term]);
  const params = new URLSearchParams({ view: 'summary' });
  if (status) params.set('status', status);
  if (operation) params.set('operation_id', operation);
  if (term) params.set('q', term);
  const cursor = cursors.at(-1);
  if (cursor) params.set('cursor', cursor);
  const query = useQuery<unknown>(
    active ? operationsAgentApi.executions + '?' + params.toString() : null,
    refresh,
  );
  const parsed = useMemo(
    () =>
      query.data === undefined ? undefined : aiExecutionLedgerResponseSchema.safeParse(query.data),
    [query.data],
  );
  const page = parsed?.success ? parsed.data : undefined;
  const nextCursor = page?.next_cursor;
  const error = query.error || (parsed && !parsed.success ? '执行列表格式无效' : '');
  if (!active) return null;
  return (
    <section aria-label="执行记录" className={cn(scrollStyles, 'space-y-4 p-4 sm:p-6')}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-section">执行记录</h2>
          <p className="mt-1 text-caption text-muted-ink">
            {readOnly
              ? '当前账号具有只读权限，可从任务记录或执行链接查看详情。'
              : '选择一条执行，查看流程、定位失败步骤或导出交接材料。'}
          </p>
        </div>
        <button
          type="button"
          className={btnStyles}
          disabled={query.loading}
          onClick={() => setRefresh((value) => value + 1)}
        >
          刷新记录
        </button>
      </div>
      <div className="grid gap-3 sm:grid-cols-[minmax(12rem,1fr)_minmax(8rem,0.45fr)_minmax(8rem,0.45fr)]">
        <input
          type="search"
          aria-label="搜索执行记录"
          placeholder="任务、执行 ID、负责人或错误码"
          maxLength={200}
          className={controlStyles}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <SelectField
          aria-label="Agent"
          value={operation}
          onValueChange={(value) => {
            setOperation(value);
            setCursors([]);
          }}
        >
          <option value="">全部 Agent</option>
          {Object.entries(operationLabels).map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </SelectField>
        <SelectField
          aria-label="执行状态"
          value={status}
          onValueChange={(value) => {
            setStatus(value);
            setCursors([]);
          }}
        >
          <option value="">全部状态</option>
          {Object.entries(statusLabels).map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </SelectField>
      </div>
      <QueryRegion label="执行记录结果" loading={query.loading} showProgress={!!page}>
        {error ? (
          <p role="alert" className="text-danger">
            {error}
          </p>
        ) : !page ? (
          <TableSkeleton label="正在加载执行记录…" columns={6} paginated />
        ) : (
          <div className={cn(dataTableStyles, operationsRevealStyles)}>
            <div className={tableWrapStyles}>
              <table className="text-left" aria-label="执行记录列表">
                <thead>
                  <tr>
                    {[
                      '任务 / 执行 ID',
                      'Agent',
                      '负责人',
                      '状态 / 错误码',
                      '创建时间',
                      '导出流程',
                    ].map((label) => (
                      <th key={label} scope="col">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {page.items.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <a
                          className="font-medium text-brand"
                          href={operationsHref('agents', { execution: row.id })}
                        >
                          {row.title}
                        </a>
                        <small className="block font-mono text-muted-ink">{row.id}</small>
                      </td>
                      <td>{operationLabels[row.operation_id] ?? row.operation_id}</td>
                      <td>{row.owner_display_name ?? row.owner_id}</td>
                      <td>
                        <ExecutionStatus compact status={row.status} />
                        {row.error_code && (
                          <small className="block font-mono text-danger">{row.error_code}</small>
                        )}
                      </td>
                      <td>
                        <time dateTime={row.created_at}>
                          {new Date(row.created_at).toLocaleString()}
                        </time>
                      </td>
                      <td>
                        <div className="flex gap-3 text-brand">
                          {(['markdown', 'json'] as const).map((format) => (
                            <a
                              key={format}
                              download
                              href={operationsAgentApi.diagnostics(row.id) + '?download=' + format}
                              aria-label={'下载 ' + row.id + ' 的 ' + format}
                            >
                              {format === 'markdown' ? 'Markdown' : 'JSON'}
                            </a>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!page.items.length && (
                <p role="status" className="p-6 text-center text-muted-ink">
                  没有符合条件的执行记录。
                </p>
              )}
            </div>
            <TablePagination
              label="执行记录"
              summary={`本页 ${page.items.length} 条`}
              page={cursors.length + 1}
              onPrevious={
                cursors.length ? () => setCursors((value) => value.slice(0, -1)) : undefined
              }
              onNext={nextCursor ? () => setCursors([...cursors, nextCursor]) : undefined}
            />
          </div>
        )}
      </QueryRegion>
    </section>
  );
}
