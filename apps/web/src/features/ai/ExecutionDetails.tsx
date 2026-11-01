import type { AiEventResponse, AiExecutionViewResponse } from '@capability-hub/contracts';
import { Activity, Braces, ChevronDown, Clock3, MessageSquare } from '../../shared/icons/lucide.js';
import { cn } from '../../shared/styles/cn.js';
import { eventLabel, jsonObject, statusLabels } from './presentation.js';
import {
  codeStyles,
  disclosureChevronStyles,
  disclosureStyles,
  metricStyles,
  readingWidthStyles,
} from './styles.js';

export function ExecutionDetails({
  view,
  events,
}: {
  view: AiExecutionViewResponse;
  events: AiEventResponse[];
}) {
  const { execution } = view;
  const timeline = events.flatMap((event) => {
    const label = eventLabel(event);
    return label ? [{ ...event, label }] : [];
  });
  const metrics = [
    ['模型请求', execution.usage.requests, '次'],
    ['工具调用', execution.usage.tools, '次'],
    ['输入用量', execution.usage.input_tokens, 'token'],
    ['输出用量', execution.usage.output_tokens, 'token'],
  ] as const;
  return (
    <div className={cn(readingWidthStyles, 'space-y-6')}>
      <section aria-label="运行用量">
        <h2 className="mb-3 text-section">运行概览</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {metrics.map(([label, number, unit]) => (
            <div key={label} className={metricStyles}>
              <span className="text-caption text-muted-ink">{label}</span>
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
          <ol className="ml-2 border-l border-[color:var(--line)] pl-5">
            {timeline.map((event) => (
              <li key={event.seq} className="relative pb-4 last:pb-0">
                <span
                  className="absolute -left-6.5 top-1.5 size-2.5 rounded-full border-2 border-paper bg-brand/60"
                  aria-hidden="true"
                />
                <p className="text-body">{event.label}</p>
                {event.type === 'execution.failed' && execution.error && (
                  <div className="my-2 rounded-lg bg-danger-soft px-3 py-2 text-danger">
                    <p>{execution.error.message}</p>
                    <p className="mt-1 text-caption">{execution.error.code}</p>
                  </div>
                )}
                <time
                  className="text-caption tabular-nums text-muted-ink"
                  dateTime={event.occurred_at}
                >
                  {new Date(event.occurred_at).toLocaleTimeString()}
                </time>
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
