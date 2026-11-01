import { useState } from 'react';
import { aiExecutionErrorLabels } from '@capability-hub/contracts';
import type { AgentExecutionDay, OperationsResponse } from '@capability-hub/contracts/http';
import { Segmented } from '../../shared/components/Segmented.js';
import { SelectField } from '../../shared/components/SelectField.js';
import { panelStyles, subtleStyles } from '../../shared/styles/recipes.js';
import { analyticsSummaryStyles, dailyCountsTableStyles } from './styles.js';

const periods = [
  { id: '7', label: '近 7 天' },
  { id: '30', label: '近 30 天' },
];
const errorLabels = new Map<string, string>(Object.entries(aiExecutionErrorLabels));

function summarize(days: AgentExecutionDay[], agent: string) {
  const statuses = {
    queued: 0,
    running: 0,
    waiting_input: 0,
    succeeded: 0,
    failed: 0,
    timed_out: 0,
    cancelled: 0,
  };
  const errors = new Map<string, number>();
  const series = days.map(({ date, counts }) => {
    let total = 0;
    let failures = 0;
    for (const row of counts) {
      if (agent !== '*' && row.operation_id !== agent) continue;
      statuses[row.status] += row.count;
      total += row.count;
      if (row.status === 'failed' || row.status === 'timed_out') {
        failures += row.count;
        const code = row.error_code ?? '';
        errors.set(code, (errors.get(code) ?? 0) + row.count);
      }
    }
    return { date, total, failures };
  });
  return {
    statuses,
    series,
    submitted: series.reduce((sum, day) => sum + day.total, 0),
    errors: [...errors].sort(([a, na], [b, nb]) => nb - na || a.localeCompare(b)),
  };
}

function DailyTrend({ series }: { series: ReturnType<typeof summarize>['series'] }) {
  const max = Math.max(1, ...series.map((day) => day.total));
  return (
    <figure className="min-w-0">
      <figcaption className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <strong className="text-label">每日新建执行</strong>
        <span className="flex gap-3 text-caption text-muted-ink">
          <span>
            <i className="mr-1 inline-block size-2 rounded-sm bg-brand" />
            其余执行
          </span>
          <span>
            <i className="mr-1 inline-block size-2 rounded-sm bg-danger" />
            失败或超时
          </span>
        </span>
      </figcaption>
      <div aria-hidden="true" className="flex gap-2">
        <span className="flex flex-col justify-between text-caption tabular-nums text-muted-ink">
          <span>{max}</span>
          <span>0</span>
        </span>
        <div className="flex h-24 min-w-0 flex-1 items-end gap-px border-b border-line sm:gap-1">
          {series.map((day) => (
            <div
              key={day.date}
              className="flex h-full min-w-0 flex-1 flex-col justify-end"
              title={`${day.date} · 新建 ${day.total} · 失败或超时 ${day.failures}`}
            >
              <span className="bg-danger" style={{ height: `${(100 * day.failures) / max}%` }} />
              <span
                className="bg-brand"
                style={{ height: `${(100 * (day.total - day.failures)) / max}%` }}
              />
            </div>
          ))}
        </div>
      </div>
      <div className="mt-1 flex justify-between text-caption tabular-nums text-muted-ink">
        <time>{series[0]?.date}</time>
        <time>{series.at(-1)?.date}</time>
      </div>
      <details className="mt-3 text-label">
        <summary className="cursor-pointer text-muted-ink">查看逐日数据</summary>
        <div className="mt-2 max-h-48 overflow-auto">
          <table className={dailyCountsTableStyles} aria-label="每日执行明细">
            <thead>
              <tr>
                <th scope="col">创建日期</th>
                <th scope="col">新建执行</th>
                <th scope="col">其中失败或超时</th>
              </tr>
            </thead>
            <tbody>
              {series.map((day) => (
                <tr key={day.date}>
                  <th scope="row">{day.date}</th>
                  <td>{day.total}</td>
                  <td>{day.failures}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}

/** 以创建日划分执行，筛选范围不改变状态口径或采样时间。 */
export function OperationsAnalytics({ agents }: { agents: OperationsResponse['agents'] }) {
  const [period, setPeriod] = useState('7');
  const [selected, setSelected] = useState('*');
  const activity = agents.daily_activity;
  const names = new Map(agents.operations.map((operation) => [operation.id, operation.title]));
  for (const day of activity ?? [])
    for (const { operation_id } of day.counts)
      if (!names.has(operation_id)) names.set(operation_id, operation_id);
  const agent = names.has(selected) ? selected : '*';
  const { statuses, submitted, series, errors } = summarize(
    activity?.slice(-Number(period)) ?? [],
    agent,
  );
  const failures = statuses.failed + statuses.timed_out;
  const decided = statuses.succeeded + failures;
  return (
    <section className={panelStyles} aria-label="Agent 运行分析">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3>Agent 运行分析</h3>
          <p className={subtleStyles}>
            按北京时间的创建日期统计，今天截至本次采样。成功率仅计完成、失败和超时。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            id="agent-analysis-period"
            label="分析时间范围"
            options={periods}
            value={period}
            onChange={setPeriod}
          />
          <SelectField aria-label="分析对象" value={agent} onValueChange={setSelected}>
            <option value="*">全部 Agent</option>
            {[...names].map(([id, name]) => (
              <option value={id} key={id}>
                {name}
              </option>
            ))}
          </SelectField>
        </div>
      </div>
      {!activity ? (
        <p className={subtleStyles}>趋势统计暂不可用，请刷新重试。</p>
      ) : submitted === 0 ? (
        <p className={subtleStyles}>所选范围暂无执行记录。</p>
      ) : (
        <>
          <div className={analyticsSummaryStyles}>
            <div>
              <span>新建执行</span>
              <strong>{submitted}</strong>
              <small>
                排队 {statuses.queued} · 执行中 {statuses.running} · 待确认 {statuses.waiting_input}
              </small>
            </div>
            <div>
              <span>执行成功率</span>
              <strong>
                {decided ? `${((100 * statuses.succeeded) / decided).toFixed(1)}%` : '—'}
              </strong>
              <small>
                {decided
                  ? `完成 ${statuses.succeeded} / ${decided} 次有结果的执行`
                  : '尚无完成、失败或超时的执行'}
              </small>
            </div>
            <div>
              <span>失败或超时</span>
              <strong>{failures}</strong>
              <small>
                失败 {statuses.failed} · 超时 {statuses.timed_out} · 另有取消 {statuses.cancelled}
              </small>
            </div>
          </div>
          <div className="mt-4 grid gap-5 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <DailyTrend series={series} />
            <div className="min-w-0">
              <h4 className="mb-2 text-label">失败与超时错误分布</h4>
              {errors.length ? (
                <dl>
                  {errors.map(([code, count]) => (
                    <div key={code}>
                      <dt className="min-w-0 break-all">
                        {errorLabels.get(code) ?? '未记录错误码'}
                        {code && <code className="mt-0.5 block text-caption">{code}</code>}
                      </dt>
                      <dd>{count} 次</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className={subtleStyles}>所选范围没有失败或超时。</p>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
