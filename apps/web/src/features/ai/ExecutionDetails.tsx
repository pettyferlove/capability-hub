import type { AiEventResponse, AiExecutionViewResponse } from '@capability-hub/contracts';
import {
  Activity,
  Braces,
  ChevronDown,
  Clock3,
  FileText,
  MessageSquare,
  Pencil,
  Sparkles,
  Wrench,
} from '../../shared/icons/lucide.js';
import { cn } from '../../shared/styles/cn.js';
import { eventLabel, jsonObject, statusLabels } from './presentation.js';
import {
  codeStyles,
  disclosureChevronStyles,
  disclosureStyles,
  metricStyles,
  readingWidthStyles,
} from './styles.js';

function eventTone(type: AiEventResponse['type']) {
  if (type.endsWith('failed') || type === 'execution.timed_out') return 'bg-danger';
  if (type === 'execution.waiting_input' || type.startsWith('interaction.')) return 'bg-warning';
  if (type === 'execution.completed') return 'bg-success';
  if (type.startsWith('tool.') || type.startsWith('message.')) return 'bg-muted-ink/35';
  return 'bg-brand';
}

/**
 * 「运行详情」页签：用量概览、任务元信息、已作答的人工决定与事件时间线，末尾附原始输入/结果/成果件。
 *
 * `events` 由调用方传入（通常是 `view.activity`），{@link eventLabel} 返回 `undefined` 的事件会被
 * 丢弃；同一 `seq` 作为 React key，因此传入列表须来自同一视图，不要拼接多次快照。
 */
export function ExecutionDetails({
  view,
  events,
}: {
  view: AiExecutionViewResponse;
  /** 用于渲染时间线的事件，按传入顺序展示，组件内不再排序。 */
  events: AiEventResponse[];
}) {
  const { execution } = view;
  const timeline = events.flatMap((event) => {
    const label = eventLabel(event);
    return label ? [{ ...event, label }] : [];
  });
  const metrics = [
    ['模型请求', execution.usage.requests, '次', Sparkles],
    ['工具调用', execution.usage.tools, '次', Wrench],
    ['输入用量', execution.usage.input_tokens, 'token', FileText],
    ['输出用量', execution.usage.output_tokens, 'token', Pencil],
  ] as const;
  return (
    <div className={cn(readingWidthStyles, 'space-y-6')}>
      <section aria-label="运行用量">
        <h2 className="mb-3 text-section">运行概览</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {metrics.map(([label, number, unit, Icon]) => (
            <div key={label} className={metricStyles}>
              <span className="flex items-center gap-1.5 text-caption text-muted-ink">
                <Icon size={13} className="text-brand" />
                {label}
              </span>
              <span className="text-xl font-semibold tabular-nums">
                {number.toLocaleString()}
                <span className="ml-1.5 text-caption font-normal text-muted-ink">{unit}</span>
              </span>
            </div>
          ))}
        </div>
        <p className="mt-2 text-caption text-muted-ink">
          用量在模型请求结束后更新。
          {execution.usage.unknown_requests > 0 &&
            `${execution.usage.unknown_requests} 次请求的用量尚待核实。`}
        </p>
      </section>
      <dl className="grid gap-x-6 gap-y-3 rounded-xl border border-[color:var(--line)] p-4 sm:grid-cols-2">
        {[
          ['任务状态', statusLabels[execution.status]],
          ['模型配置', execution.model_profile],
          ['开始时间', new Date(execution.created_at).toLocaleString()],
          ['最后更新', new Date(execution.updated_at).toLocaleString()],
          ['任务编号', execution.id],
          ['人工继续', `${execution.continuation} 次`],
        ].map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="text-caption text-muted-ink">{label}</dt>
            <dd className="mt-1 break-all">{value}</dd>
          </div>
        ))}
      </dl>
      {view.interactions
        .filter((item) => item.status === 'answered' || item.status === 'applied')
        .map((interaction) => {
          const response = jsonObject(interaction.response);
          const request = jsonObject(interaction.request);
          return (
            <section
              key={interaction.id}
              className="rounded-xl border border-[color:var(--line)] p-4"
            >
              <h3 className="mb-2 flex items-center gap-2 text-body font-semibold">
                <MessageSquare size={14} />
                人工决定
              </h3>
              {typeof response.approved === 'boolean' ? (
                <>
                  <p>
                    {response.approved
                      ? request.assessment
                        ? '采纳研判'
                        : '采纳草案'
                      : '暂不采纳'}
                  </p>
                  {typeof response.comment === 'string' && response.comment && (
                    <p className="mt-2 whitespace-pre-wrap break-words text-muted-ink">
                      {response.comment}
                    </p>
                  )}
                </>
              ) : (
                <pre className={codeStyles}>{JSON.stringify(interaction.response, null, 2)}</pre>
              )}
            </section>
          );
        })}
      <section aria-label="执行过程">
        <h2 className="flex items-center gap-2 text-section">
          <Activity size={17} className="text-brand" />
          执行过程
        </h2>
        <p className="mt-1 mb-4 text-caption text-muted-ink">展示已保存的活动记录与当前进展。</p>
        {timeline.length ? (
          <ol>
            {timeline.map((event) => (
              <li key={event.seq} className="group grid grid-cols-[4.5rem_0.75rem_1fr] gap-x-3">
                <time
                  className="pt-0.5 text-right text-caption tabular-nums text-muted-ink"
                  dateTime={event.occurred_at}
                >
                  {new Date(event.occurred_at).toLocaleTimeString()}
                </time>
                <span className="relative flex justify-center" aria-hidden="true">
                  <span className="absolute inset-y-0 w-px bg-line group-first:top-2.5 group-last:bottom-auto group-last:h-2.5" />
                  <span
                    className={cn(
                      'relative mt-1.5 size-2.5 rounded-full ring-4 ring-paper',
                      eventTone(event.type),
                    )}
                  />
                </span>
                <div className="min-w-0 pb-4 group-last:pb-0">
                  <p
                    className={cn(
                      'text-body',
                      (event.type.startsWith('tool.') || event.type.startsWith('message.')) &&
                        'text-muted-ink',
                    )}
                  >
                    {event.label}
                  </p>
                  {event.type === 'execution.failed' && execution.error && (
                    <div className="mt-2 rounded-lg bg-danger-soft px-3 py-2 text-danger">
                      <p>{execution.error.message}</p>
                      <p className="mt-1 font-mono text-caption">{execution.error.code}</p>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="flex items-center gap-2 rounded-xl bg-page p-4 text-muted-ink">
            <Clock3 size={15} />
            当前任务尚未产生过程事件。
          </p>
        )}
      </section>
      <details className={disclosureStyles}>
        <summary>
          <Braces size={15} />
          原始任务数据
          <ChevronDown size={14} className={disclosureChevronStyles} />
        </summary>
        <div className="space-y-4 p-4">
          <div>
            <h3 className="mb-2 text-body">输入</h3>
            <pre className={codeStyles}>{JSON.stringify(execution.input, null, 2)}</pre>
          </div>
          <div>
            <h3 className="mb-2 text-body">结果</h3>
            <pre className={codeStyles}>{JSON.stringify(execution.result, null, 2)}</pre>
          </div>
          {view.artifacts.map((artifact) => (
            <div key={artifact.id}>
              <h3 className="mb-2 break-words text-body">{artifact.name}</h3>
              <pre className={codeStyles}>{JSON.stringify(artifact.content, null, 2)}</pre>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}
