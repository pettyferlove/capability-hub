import { useMemo, useState } from 'react';
import {
  tokenUsageResponseSchema,
  type TokenUsagePeriod,
  type TokenUsageResponse,
} from '@capability-hub/contracts';
import { useQuery } from '../../../shared/api/use-query.js';
import { ErrorState } from '../../../shared/components/ErrorState.js';
import { Segmented } from '../../../shared/components/Segmented.js';
import { TablePagination } from '../../../shared/components/TablePagination.js';
import { RefreshCw } from '../../../shared/icons/lucide.js';
import {
  btnStyles,
  dataTableStyles,
  formStackStyles,
  panelStyles,
  subtleStyles,
  tableWrapStyles,
} from '../../../shared/styles/recipes.js';
import { analyticsSummaryStyles, dailyCountsTableStyles } from '../styles.js';

const periods: { id: TokenUsagePeriod; label: string }[] = [
  { id: 'today', label: '今天' },
  { id: '7d', label: '近 7 天' },
  { id: '30d', label: '近 30 天' },
  { id: 'all', label: '全部留存' },
];
type Dimension = 'by_agent' | 'by_profile' | 'by_user';
const dimensions: { id: Dimension; label: string }[] = [
  { id: 'by_agent', label: 'Agent' },
  { id: 'by_profile', label: '模型档案' },
  { id: 'by_user', label: '用户' },
];
const number = new Intl.NumberFormat('zh-CN');
const observedTime = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai',
  dateStyle: 'short',
  timeStyle: 'short',
});

function confirmed(row: TokenUsageResponse['totals']) {
  return row.input_tokens + row.output_tokens;
}

function UsageTrend({ data }: { data: TokenUsageResponse }) {
  const max = Math.max(0, ...data.trend.map(confirmed));
  const label = data.granularity === 'month' ? '每月' : '每日';
  return (
    <figure className={panelStyles}>
      <figcaption className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <strong>{label} Token 趋势</strong>
        <span className="flex gap-3 text-caption text-muted-ink">
          <span>
            <i className="mr-1 inline-block size-2 rounded-sm bg-brand" />
            输入
          </span>
          <span>
            <i className="mr-1 inline-block size-2 rounded-sm bg-success" />
            输出
          </span>
        </span>
      </figcaption>
      {max === 0 ? (
        <p className={subtleStyles}>此范围的已确认 Token 合计为 0。</p>
      ) : (
        <div aria-hidden="true" className="flex gap-2">
          <div className="flex flex-col justify-between text-caption tabular-nums text-muted-ink">
            <span>{number.format(max)}</span>
            <span>0</span>
          </div>
          <div className="flex h-28 min-w-0 flex-1 items-end gap-px border-b border-line">
            {data.trend.map((row) => (
              <div
                key={row.bucket}
                className="flex h-full min-w-0 flex-1 flex-col justify-end"
                title={
                  row.bucket +
                  ' · 输入 ' +
                  number.format(row.input_tokens) +
                  ' · 输出 ' +
                  number.format(row.output_tokens)
                }
              >
                <span
                  className="bg-success"
                  style={{ height: (row.output_tokens * 100) / max + '%' }}
                />
                <span
                  className="bg-brand"
                  style={{ height: (row.input_tokens * 100) / max + '%' }}
                />
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="mt-1 flex justify-between text-caption text-muted-ink">
        <span>{data.trend[0]?.bucket}</span>
        <span>{data.trend.length > 1 && data.trend.at(-1)?.bucket}</span>
      </div>
      <details className="mt-3">
        <summary className="cursor-pointer text-label text-muted-ink">查看趋势明细</summary>
        <div className="mt-2 max-h-52 overflow-auto">
          <table className={dailyCountsTableStyles} aria-label="Token 趋势明细">
            <thead>
              <tr>
                {['北京时间', '输入 Token', '输出 Token', '已确认合计', '请求数'].map((name) => (
                  <th key={name} scope="col">
                    {name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.trend.map((row) => (
                <tr key={row.bucket}>
                  <th scope="row">{row.bucket}</th>
                  <td>{number.format(row.input_tokens)}</td>
                  <td>{number.format(row.output_tokens)}</td>
                  <td>{number.format(confirmed(row))}</td>
                  <td>{number.format(row.requests)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}

function UsageDistribution({ data }: { data: TokenUsageResponse }) {
  const [dimension, setDimension] = useState<Dimension>('by_agent');
  const [page, setPage] = useState(0);
  const rows = data[dimension];
  const last = Math.max(0, Math.ceil(rows.length / 15) - 1);
  const current = Math.min(page, last);
  const total = confirmed(data.totals);
  return (
    <section className={panelStyles} aria-label="Token 用量分布">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3>Token 用量分布</h3>
        <Segmented
          id="token-usage-dimension"
          label="分布维度"
          options={dimensions}
          value={dimension}
          onChange={(value) => {
            setDimension(value);
            setPage(0);
          }}
        />
      </div>
      <p className={subtleStyles}>
        占比按所选范围的已确认 Token 计算。{dimension === 'by_user' && '自动任务计入任务所有者。'}
        {dimension === 'by_profile' && '按调用时记录的模型档案 ID 归属。'}
      </p>
      <div className={dataTableStyles}>
        <div className={tableWrapStyles}>
          <table className="text-right" aria-label="Token 分布明细">
            <thead>
              <tr>
                {['对象', '输入 Token', '输出 Token', '已确认合计', '占比', '模型请求'].map(
                  (name) => (
                    <th key={name} scope="col" className="first:text-left">
                      {name}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {rows.slice(current * 15, (current + 1) * 15).map((row) => (
                <tr key={row.id}>
                  <th scope="row" className="text-left">
                    {row.label}
                    {row.label !== row.id && (
                      <small className="block break-all font-mono font-normal text-muted-ink">
                        {row.id}
                      </small>
                    )}
                  </th>
                  <td>{number.format(row.input_tokens)}</td>
                  <td>{number.format(row.output_tokens)}</td>
                  <td>{number.format(confirmed(row))}</td>
                  <td>{total ? ((100 * confirmed(row)) / total).toFixed(1) + '%' : '—'}</td>
                  <td>
                    {number.format(row.requests)}
                    {!!(row.unknown_requests + row.pending_requests) && (
                      <small className="block text-muted-ink">
                        不完整 {row.unknown_requests} · 待结算 {row.pending_requests}
                      </small>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {last > 0 && (
          <TablePagination
            label="用量分布"
            summary={`共 ${rows.length} 项`}
            page={current + 1}
            pageCount={last + 1}
            onPrevious={current > 0 ? () => setPage(current - 1) : undefined}
            onNext={current < last ? () => setPage(current + 1) : undefined}
          />
        )}
      </div>
    </section>
  );
}

/** 各项指标共用当前范围的快照，切换范围后不显示上次采样的用量。 */
export function TokenUsagePanel() {
  const [period, setPeriod] = useState<TokenUsagePeriod>('all');
  const [refresh, setRefresh] = useState(0);
  const query = useQuery<unknown>('/api/admin/token-usage?period=' + period, refresh);
  const parsed = useMemo(
    () => (query.data === undefined ? undefined : tokenUsageResponseSchema.safeParse(query.data)),
    [query.data],
  );
  const data = parsed?.success && parsed.data.period === period ? parsed.data : undefined;
  const error = query.error || (parsed && !data ? 'Token 用量数据格式无效' : '');
  const reload = () => setRefresh((value) => value + 1);
  return (
    <div className={formStackStyles}>
      <section className={panelStyles} aria-label="项目 Token 用量">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2>项目 Token 用量</h2>
            <p className={subtleStyles}>
              统计本实例保留的所有用户模型请求，按请求开始时间归入北京时间。
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Segmented
              id="token-usage-period"
              label="用量时间范围"
              options={periods}
              value={period}
              onChange={setPeriod}
            />
            <button type="button" className={btnStyles} disabled={query.loading} onClick={reload}>
              <RefreshCw size={14} />
              刷新
            </button>
          </div>
        </div>
        {error ? (
          <ErrorState message={error} retry={reload} />
        ) : query.loading || !data ? (
          <p role="status">正在读取 Token 用量…</p>
        ) : (
          <>
            <div className={analyticsSummaryStyles}>
              {(
                [
                  ['已确认 Token', confirmed(data.totals)],
                  ['输入 Token', data.totals.input_tokens],
                  ['输出 Token', data.totals.output_tokens],
                ] as const
              ).map(([label, value]) => (
                <div key={label}>
                  <span>{label}</span>
                  <strong>{number.format(value)}</strong>
                </div>
              ))}
            </div>
            <p className="mt-3 text-label">
              模型请求 {number.format(data.totals.requests)} 次 · 用量完整{' '}
              {number.format(
                data.totals.requests - data.totals.unknown_requests - data.totals.pending_requests,
              )}{' '}
              次 · 用量不完整 {number.format(data.totals.unknown_requests)} 次 · 待结算{' '}
              {number.format(data.totals.pending_requests)} 次
            </p>
            {!!data.totals.unknown_requests && (
              <p className={subtleStyles}>
                不完整请求已回传输入 {number.format(data.totals.partial_input_tokens)}、输出{' '}
                {number.format(data.totals.partial_output_tokens)} Token，单独列示。
              </p>
            )}
            <p className={subtleStyles}>
              采样于 {observedTime.format(new Date(data.observed_at))}（北京时间）。
            </p>
            {!data.totals.requests && <p role="status">所选范围没有模型请求。</p>}
          </>
        )}
      </section>
      {!error && !query.loading && data && data.totals.requests > 0 && (
        <>
          <UsageTrend data={data} />
          <UsageDistribution key={period} data={data} />
        </>
      )}
    </div>
  );
}
