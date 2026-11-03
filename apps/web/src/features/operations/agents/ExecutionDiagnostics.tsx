import { useMemo, useState } from 'react';
import {
  aiDiagnosticHandoffResponseSchema,
  aiExecutionDiagnosticsResponseSchema,
  operationsAgentApi,
  type AiEventResponse,
} from '@capability-hub/contracts';
import { useQuery } from '../../../shared/api/use-query.js';
import { CopyButton } from '../../../shared/components/CopyButton.js';
import { QueryRegion } from '../../../shared/components/QueryRegion.js';
import { SkeletonBlock, SkeletonRegion } from '../../../shared/components/Skeleton.js';
import { DiagnosticsSkeleton } from '../OperationsSkeleton.js';
import { operationsRevealStyles } from '../styles.js';
import { SelectField } from '../../../shared/components/SelectField.js';
import { Download } from '../../../shared/icons/lucide.js';
import { cn } from '../../../shared/styles/cn.js';
import { btnStyles, dataTableStyles, tableWrapStyles } from '../../../shared/styles/recipes.js';
import { eventLabel } from '../../ai/presentation.js';
import { codeStyles, controlStyles, disclosureStyles } from '../../ai/styles.js';

const categories = {
  key: '关键事件',
  all: '全部事件',
  error: '异常',
  step: '步骤',
  tool: '工具',
  interaction: '人工交互',
  message: '消息',
};
const callStatus = {
  pending: '待结算',
  succeeded: '已成功',
  failed: '失败',
  unknown: '用量待核实',
};
const pageSize = 40;

function matchesCategory(event: AiEventResponse, category: string) {
  if (category === 'all') return true;
  if (category === 'key') return event.type !== 'message.delta' && event.type !== 'usage.updated';
  if (category === 'error')
    return event.type.endsWith('.failed') || event.type === 'execution.timed_out';
  return event.type.startsWith(category + '.');
}

function HandoffPreview({ path }: { path: string }) {
  const query = useQuery<unknown>(path + '?view=handoff');
  const parsed = useMemo(
    () =>
      query.data === undefined
        ? undefined
        : aiDiagnosticHandoffResponseSchema.safeParse(query.data),
    [query.data],
  );
  const error = query.error || (parsed && !parsed.success ? '交接文本格式无效' : '');
  if (error)
    return (
      <p role="alert" className="text-danger">
        {error}
      </p>
    );
  if (!parsed?.success)
    return (
      <SkeletonRegion label="正在准备交接文本…">
        <div className="grid gap-2">
          <SkeletonBlock width="38%" />
          <SkeletonBlock height={144} shape="rect" />
        </div>
      </SkeletonRegion>
    );
  const handoff = parsed.data;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3 text-caption">
        <span>交接快照截至事件 #{handoff.watermark}</span>
        <CopyButton text={handoff.markdown} label="复制交接 Markdown" />
      </div>
      <textarea
        className="w-full rounded-lg bg-page p-3 font-mono text-caption"
        aria-label="Agent 交接文本"
        readOnly
        rows={8}
        value={handoff.markdown}
      />
    </div>
  );
}

/** 屏幕固定在读取时的水位，运行产生的新事件由管理员显式刷新。 */
export function ExecutionDiagnostics({ id, liveWatermark }: { id: string; liveWatermark: number }) {
  const path = operationsAgentApi.diagnostics(id);
  const [refresh, setRefresh] = useState(0);
  const [category, setCategory] = useState('key');
  const [sequence, setSequence] = useState('');
  const [page, setPage] = useState(0);
  const [handoff, setHandoff] = useState(false);
  const query = useQuery<unknown>(path, refresh);
  const parsed = useMemo(
    () =>
      query.data === undefined
        ? undefined
        : aiExecutionDiagnosticsResponseSchema.safeParse(query.data),
    [query.data],
  );
  const report = parsed?.success && parsed.data.execution.id === id ? parsed.data : undefined;
  const events = useMemo(
    () =>
      report?.events.filter((event) =>
        sequence ? event.seq === Number(sequence) : matchesCategory(event, category),
      ) ?? [],
    [report, category, sequence],
  );
  const slowSteps = useMemo(
    () =>
      report?.traces
        .slice()
        .sort((a, b) => b.duration_ms - a.duration_ms)
        .slice(0, 5) ?? [],
    [report],
  );
  const lastPage = Math.max(0, Math.ceil(events.length / pageSize) - 1);
  const currentPage = Math.min(page, lastPage);
  const error = query.error || (parsed && !report ? '执行诊断数据无效' : '');
  const reload = () => {
    setRefresh((value) => value + 1);
    setHandoff(false);
  };
  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-section">流程诊断</h2>
          <p className="mt-1 text-caption text-muted-ink">
            按事件序号回看执行，导出当前快照供复盘或 Agent 分析。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={path + '?download=json'} download className={btnStyles}>
            <Download size={14} />
            完整 JSON
          </a>
          <a href={path + '?download=markdown'} download className={btnStyles}>
            <Download size={14} />
            交接 Markdown
          </a>
          <button type="button" className={btnStyles} disabled={query.loading} onClick={reload}>
            刷新快照
          </button>
        </div>
      </div>
      <QueryRegion label="流程诊断结果" loading={query.loading} showProgress={!!report}>
        {error ? (
          <p role="alert" className="text-danger">
            {error}
          </p>
        ) : !report ? (
          <DiagnosticsSkeleton />
        ) : (
          <div className={cn('space-y-6', operationsRevealStyles)}>
            <dl className="grid gap-3 rounded-xl border border-[color:var(--line)] bg-page p-4 text-caption sm:grid-cols-2 lg:grid-cols-3">
              {[
                ['执行 ID', report.execution.id],
                ['负责人', report.owner_display_name],
                [
                  'Agent / 定义版本',
                  report.execution.operation_id + ' / ' + report.workflow.definition_version,
                ],
                ['运行 ID', report.workflow.run_id],
                [
                  '调度 / 人工继续',
                  report.execution.attempt + ' / ' + report.execution.continuation,
                ],
                ['快照', new Date(report.captured_at).toLocaleString() + ' · #' + report.watermark],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-muted-ink">{label}</dt>
                  <dd className="mt-1 break-all font-medium">{value}</dd>
                </div>
              ))}
            </dl>
            {liveWatermark > report.watermark && (
              <p role="status" className="text-warning">
                执行已推进到 #{liveWatermark}，刷新可查看新事件。
              </p>
            )}
            {!!report.event_gaps.length && (
              <p role="alert" className="text-warning">
                历史事件缺失：
                {report.event_gaps
                  .map((gap) => '#' + gap.from_seq + '–#' + gap.through_seq)
                  .join('、')}
              </p>
            )}
            {report.execution.error && (
              <section aria-label="终止原因" className="rounded-xl bg-danger-soft p-4 text-danger">
                <h3 className="font-semibold">{report.execution.error.code}</h3>
                <p>{report.execution.error.message}</p>
                <button
                  type="button"
                  className={btnStyles}
                  onClick={() => {
                    setCategory('error');
                    setSequence('');
                    setPage(0);
                  }}
                >
                  定位异常事件
                </button>
              </section>
            )}
            <button
              type="button"
              aria-expanded={handoff}
              className={btnStyles}
              onClick={() => setHandoff(!handoff)}
            >
              {handoff ? '收起交接文本' : '预览并复制交接文本'}
            </button>
            {handoff && <HandoffPreview path={path} />}
            <section aria-label="事件时间线" className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-section">
                  事件时间线{' '}
                  <small className="text-caption text-muted-ink">{events.length} 条</small>
                </h3>
                <div className="flex flex-wrap gap-2">
                  <input
                    type="search"
                    aria-label="定位事件序号"
                    placeholder="定位事件序号"
                    className={cn(controlStyles, 'w-34')}
                    value={sequence}
                    onChange={(event) => {
                      setSequence(event.target.value.replace(/^#/, ''));
                      setPage(0);
                    }}
                  />
                  <SelectField
                    aria-label="事件类别"
                    value={category}
                    onValueChange={(value) => {
                      setCategory(value);
                      setSequence('');
                      setPage(0);
                    }}
                  >
                    {Object.entries(categories).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </SelectField>
                </div>
              </div>
              {events.slice(currentPage * pageSize, (currentPage + 1) * pageSize).map((event) => (
                <details className={disclosureStyles} key={event.seq}>
                  <summary>
                    <span className="font-mono text-caption text-muted-ink">#{event.seq}</span>
                    <span>{eventLabel(event) ?? event.type}</span>
                    {typeof event.data.code === 'string' && (
                      <span className="font-mono text-danger">{event.data.code}</span>
                    )}
                    <span className="ml-auto text-caption text-muted-ink">
                      {new Date(event.occurred_at).toLocaleTimeString()} · 调度 {event.attempt} /
                      继续 {event.continuation}
                    </span>
                  </summary>
                  <pre className={codeStyles}>{JSON.stringify(event, null, 2)}</pre>
                </details>
              ))}
              {!events.length && <p className="text-muted-ink">没有此类事件。</p>}
              {lastPage > 0 && (
                <nav
                  aria-label="事件分页"
                  className="flex items-center justify-end gap-2 text-caption"
                >
                  <button
                    type="button"
                    className={btnStyles}
                    disabled={!currentPage}
                    onClick={() => setPage(currentPage - 1)}
                  >
                    上一页
                  </button>
                  <span>
                    {currentPage + 1} / {lastPage + 1}
                  </span>
                  <button
                    type="button"
                    className={btnStyles}
                    disabled={currentPage === lastPage}
                    onClick={() => setPage(currentPage + 1)}
                  >
                    下一页
                  </button>
                </nav>
              )}
            </section>
            {!!slowSteps.length && (
              <section aria-label="步骤耗时" className="space-y-2">
                <h3 className="text-section">耗时最长的步骤</h3>
                <ol className="divide-y divide-line rounded-xl border border-[color:var(--line)] px-4">
                  {slowSteps.map((step) => (
                    <li
                      key={step.id}
                      className="flex flex-wrap items-center gap-3 py-2 text-caption"
                    >
                      <strong className="grow break-all">{step.name}</strong>
                      <time dateTime={step.started_at}>
                        {new Date(step.started_at).toLocaleTimeString()}
                      </time>
                      <span className="font-mono">{step.duration_ms} ms</span>
                    </li>
                  ))}
                </ol>
              </section>
            )}
            <section aria-label="模型请求" className="space-y-2">
              <h3 className="text-section">模型请求</h3>
              {report.model_calls.length ? (
                <div className={dataTableStyles}>
                  <div className={tableWrapStyles}>
                    <table className="text-left">
                      <thead>
                        <tr>
                          {[
                            '调用 / 档案',
                            '调度',
                            '状态',
                            '耗时',
                            '输入 / 输出 token',
                            '错误码',
                          ].map((label) => (
                            <th scope="col" key={label}>
                              {label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {report.model_calls.map((call) => (
                          <tr key={call.id}>
                            <td>
                              {call.profile}
                              <small className="block font-mono">{call.id}</small>
                              <time
                                className="block text-caption text-muted-ink"
                                dateTime={call.started_at}
                                title={call.started_at}
                              >
                                {new Date(call.started_at).toLocaleTimeString()}
                              </time>
                            </td>
                            <td>{call.attempt}</td>
                            <td>{callStatus[call.status]}</td>
                            <td>
                              {call.status === 'pending' ||
                              (call.status === 'unknown' && !call.duration_ms)
                                ? '—'
                                : call.duration_ms + ' ms'}
                            </td>
                            <td>
                              {call.input_tokens} / {call.output_tokens}
                            </td>
                            <td>{call.error_code ?? '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <p className="text-muted-ink">尚无模型请求。</p>
              )}
            </section>
          </div>
        )}
      </QueryRegion>
    </div>
  );
}
