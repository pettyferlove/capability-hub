import { useMemo, useState } from 'react';
import {
  resourceActivityResponseSchema,
  type ResourceActivityResponse,
} from '@capability-hub/contracts';
import { useQuery } from '../../../shared/api/use-query.js';
import { Segmented } from '../../../shared/components/Segmented.js';
import { ErrorState } from '../../../shared/components/ErrorState.js';
import { RefreshCw } from '../../../shared/icons/lucide.js';
import {
  btnStyles,
  dataTableStyles,
  formStackStyles,
  panelStyles,
  sectionHeadingStyles,
  subtleStyles,
  tableWrapStyles,
} from '../../../shared/styles/recipes.js';
import { cn } from '../../../shared/styles/cn.js';

type Day = ResourceActivityResponse['daily'][number];
const periods = [
  { id: '7', label: '近 7 天' },
  { id: '30', label: '近 30 天' },
];
const number = new Intl.NumberFormat('zh-CN');
const time = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai',
  dateStyle: 'short',
  timeStyle: 'short',
});
const releases = (day: Day) => day.first_releases + day.repeat_releases;
const usage = (day: Day) => day.downloads + day.skill_loads + day.install_requests;
const feedback = (day: Day) =>
  day.feedback_pending + day.feedback_in_progress + day.feedback_resolved + day.feedback_declined;

function Trend({
  label,
  unit,
  daily,
  value,
  color,
}: {
  label: string;
  unit: string;
  daily: Day[];
  value: (day: Day) => number;
  color: string;
}) {
  const series = daily.map(value);
  const peak = Math.max(0, ...series);
  return (
    <figure className={panelStyles}>
      <figcaption>
        <h3>{label}</h3>
        <strong className="text-2xl tabular-nums">
          {number.format(series.reduce((a, b) => a + b, 0))}
        </strong>
        <span className="ml-1 text-caption text-muted-ink">{unit}</span>
        <p className="text-caption text-muted-ink">
          单日最高 {number.format(peak)} {unit}
        </p>
      </figcaption>
      <div className="mt-3 flex h-16 items-end gap-px border-b border-line" aria-hidden="true">
        {daily.map((day, i) => (
          <div
            key={day.date}
            className="flex h-full min-w-0 flex-1 items-end justify-center"
            title={day.date + ' · ' + number.format(series[i]) + ' ' + unit}
          >
            <span
              className={cn('w-full max-w-8 rounded-t-sm', color)}
              style={{ height: (100 * series[i]) / (peak || 1) + '%' }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-caption text-muted-ink">
        <time>{daily[0]?.date}</time>
        <time>{daily.at(-1)?.date}</time>
      </div>
    </figure>
  );
}

function Counts({ title, note, rows }: { title: string; note: string; rows: [string, number][] }) {
  return (
    <section className={panelStyles} aria-label={title}>
      <h3>{title}</h3>
      <p className={subtleStyles}>{note}</p>
      <dl className="mt-3 divide-y divide-line">
        {rows.map(([name, count]) => (
          <div key={name} className="flex justify-between gap-3 py-2 text-label">
            <dt>{name}</dt>
            <dd className="font-semibold tabular-nums">{number.format(count)}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** 同一天的发布、分发与反馈使用独立计数；请求失败时不将缺失样本当作零。 */
export function ResourceOverview() {
  const [days, setDays] = useState('7');
  const [refresh, setRefresh] = useState(0);
  const result = useQuery<unknown>('/api/admin/resource-activity?days=' + days, refresh);
  const parsed = useMemo(
    () =>
      result.data === undefined ? undefined : resourceActivityResponseSchema.safeParse(result.data),
    [result.data],
  );
  const data =
    parsed?.success && parsed.data.daily.length === Number(days) ? parsed.data : undefined;
  const error = result.error || (parsed && !data ? '资源趋势数据格式无效' : '');
  const reload = () => setRefresh((value) => value + 1);
  const sum = (key: Exclude<keyof Day, 'date'>) =>
    data?.daily.reduce((total, day) => total + day[key], 0) ?? 0;
  return (
    <section aria-label="资源运营概览" className={formStackStyles}>
      <div className={sectionHeadingStyles}>
        <div>
          <h2>资源运营概览</h2>
          <p className={subtleStyles}>
            按北京时间统计正式发布、资源使用请求和新提交的反馈。
            {data &&
              !error &&
              !result.loading &&
              '采样于 ' + time.format(new Date(data.observed_at)) + '。'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            id="resource-period"
            label="运营统计范围"
            options={periods}
            value={days}
            onChange={setDays}
          />
          <button type="button" className={btnStyles} onClick={reload} disabled={result.loading}>
            <RefreshCw size={14} />
            刷新
          </button>
        </div>
      </div>
      {error ? (
        <ErrorState message={error} retry={reload} />
      ) : result.loading || !data ? (
        <p role="status">正在读取资源趋势…</p>
      ) : (
        <>
          {data.daily.every((day) => !releases(day) && !usage(day) && !feedback(day)) && (
            <p role="status" className={subtleStyles}>
              所选期间没有资源发布、使用请求或新增反馈。
            </p>
          )}
          <div className="grid gap-3 md:grid-cols-3">
            <Trend
              label="正式发布"
              unit="次"
              daily={data.daily}
              value={releases}
              color="bg-brand"
            />
            <Trend
              label="资源使用请求"
              unit="次"
              daily={data.daily}
              value={usage}
              color="bg-info"
            />
            <Trend
              label="新增反馈"
              unit="条"
              daily={data.daily}
              value={feedback}
              color="bg-warning"
            />
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <Counts
              title="发布构成"
              note="同一资源按发布序号区分首次和后续发布。"
              rows={[
                ['首次发布', sum('first_releases')],
                ['后续发布', sum('repeat_releases')],
              ]}
            />
            <Counts
              title="使用渠道"
              note="计数来自审计记录，表示分发请求次数。"
              rows={[
                ['归档下载', sum('downloads')],
                ['Skill 加载', sum('skill_loads')],
                ['Skill 安装准备', sum('install_requests')],
              ]}
            />
            <Counts
              title="反馈处理状态"
              note="所选期间提交的反馈，按当前处理状态分组。"
              rows={[
                ['待处理', sum('feedback_pending')],
                ['处理中', sum('feedback_in_progress')],
                ['已解决', sum('feedback_resolved')],
                ['不采纳', sum('feedback_declined')],
              ]}
            />
          </div>
          <details className={panelStyles}>
            <summary className="cursor-pointer font-medium">查看逐日明细</summary>
            <div className={cn(dataTableStyles, 'mt-3')}>
              <div className={tableWrapStyles}>
                <table className="text-right" aria-label="资源运营逐日明细">
                  <thead>
                    <tr>
                      {['日期', '正式发布', '归档下载', 'Skill 加载', '安装准备', '新增反馈'].map(
                        (label) => (
                          <th scope="col" key={label} className="first:text-left">
                            {label}
                          </th>
                        ),
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {data.daily.map((day) => (
                      <tr key={day.date}>
                        <th className="text-left" scope="row">
                          {day.date}
                        </th>
                        <td>{releases(day)}</td>
                        <td>{day.downloads}</td>
                        <td>{day.skill_loads}</td>
                        <td>{day.install_requests}</td>
                        <td>{feedback(day)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </details>
        </>
      )}
    </section>
  );
}
