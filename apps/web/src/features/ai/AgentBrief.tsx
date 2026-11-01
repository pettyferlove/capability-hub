import { useState, type RefObject } from 'react';
import type { AiExecutionResponse, AiExecutionViewResponse } from '@capability-hub/contracts';
import { ChevronRight, Plus } from '../../shared/icons/lucide.js';
import { cn } from '../../shared/styles/cn.js';
import { activityItems } from './activity.js';
import { eventLabel, jsonObject, statusLabels, toolLabels } from './presentation.js';

type Status = AiExecutionResponse['status'];
const riskLabels: Record<string, string> = {
  low: '较低风险',
  medium: '需要关注',
  high: '高风险',
  unknown: '证据有限',
};

function reportRisk(view?: AiExecutionViewResponse) {
  const report =
    view?.execution.result ??
    view?.artifacts.find((a) => a.name === 'assessment')?.content ??
    jsonObject(view?.interactions.find((i) => i.status === 'pending')?.request).assessment;
  const risk = jsonObject(jsonObject(report).assessment).risk;
  return typeof risk === 'string' ? risk : '';
}

function briefLine(
  view: AiExecutionViewResponse | undefined,
  status: Status | undefined,
  risk: string,
) {
  if (status === 'waiting_input' || status === 'succeeded') {
    const result = jsonObject(view?.execution.result);
    const decision =
      result.approved === true ? '已采纳' : result.approved === false ? '未采纳' : '报告就绪';
    return [decision, riskLabels[risk]].filter(Boolean).join(' · ');
  }
  if (status === 'queued') return '任务已排队';
  if (status === 'failed' || status === 'timed_out') return '查看失败原因';
  if (status === 'cancelled') return '任务已取消';
  if (!status || !view) return '';
  const activity = activityItems(view).at(-1);
  const step = [...view.activity].reverse().find((e) => e.type.startsWith('step.'));
  if (
    step?.data.step_id === 'assessment' ||
    (activity?.kind === 'message' && activity.block.message_id.startsWith('assessment:'))
  )
    return '整理研判报告';
  if (activity?.kind === 'tool')
    return [toolLabels[activity.name] ?? activity.name, activity.display]
      .filter(Boolean)
      .join(' · ');
  if (activity?.kind === 'message') return activity.block.text.trim().slice(-52) || '正在查阅证据';
  return (step && eventLabel(step)) || '正在查阅证据';
}

const signals = {
  working: ['00100', '01101', '11111', '11111', '11111'],
  waiting: ['01010', '01010', '01010', '01010', '01010'],
  complete: ['00000', '00001', '00010', '10100', '01000'],
  caution: ['00100', '00100', '00100', '00000', '00100'],
  error: ['10001', '01010', '00100', '01010', '10001'],
  idle: ['00000', '00000', '10101', '00000', '00000'],
};

function Signal({ state }: { state: keyof typeof signals }) {
  return (
    <span aria-hidden="true" className="grid grid-cols-5 gap-[2px]">
      {signals[state].flatMap((row, y) =>
        [...row].map((dot, x) => (
          <span
            key={y * 5 + x}
            className={cn(
              'size-[3px] rounded-full bg-current',
              dot === '0' && 'opacity-15',
              state === 'working' &&
                dot === '1' &&
                'motion-safe:animate-[agent-signal_1.4s_ease-in-out_infinite]',
            )}
            style={{ animationDelay: `${x * 145 - y * 95}ms` }}
          />
        )),
      )}
    </span>
  );
}

export function AgentBrief({
  actionRef,
  startAvailable,
  starting,
  onStart,
  view,
  status,
  title,
  emptyLabel,
  error,
  open,
  toggleRef,
  panelId,
  onToggle,
}: {
  startAvailable: boolean;
  starting: boolean;
  onStart: () => void;
  actionRef: (slot: HTMLDivElement | null) => void;
  view?: AiExecutionViewResponse;
  status?: Status;
  title: string;
  emptyLabel: string;
  error: string;
  open: boolean;
  toggleRef: RefObject<HTMLButtonElement | null>;
  panelId: string;
  onToggle: () => void;
}) {
  const [orbOnly, setOrbOnly] = useState(false);
  if (open) return null;
  const risk = reportRisk(view);
  const flagged = status === 'succeeded' && (risk === 'high' || risk === 'medium');
  const signal =
    error || status === 'failed' || status === 'timed_out'
      ? 'error'
      : status === 'waiting_input'
        ? 'waiting'
        : status === 'succeeded'
          ? flagged
            ? 'caution'
            : 'complete'
          : status === 'running' || status === 'queued'
            ? 'working'
            : 'idle';
  const stateLabel = error
    ? '需要处理'
    : status === 'waiting_input'
      ? '等待你的确认'
      : status
        ? statusLabels[status]
        : emptyLabel;
  const line = error || briefLine(view, status, risk) || stateLabel;
  return (
    <section
      aria-label="Agent 任务简报"
      className={cn(
        'pointer-events-auto flex max-w-full items-center rounded-full bg-paper text-ink shadow-overlay',
        orbOnly
          ? 'size-11 justify-center'
          : 'w-[min(328px,calc(100vw_-_32px))] gap-1 border border-separator p-1.5',
      )}
    >
      <button
        type="button"
        aria-expanded={!orbOnly}
        aria-label={orbOnly ? '展开 Agent 状态条' : '收起为悬浮球'}
        title={
          orbOnly
            ? [title, stateLabel, line !== stateLabel && line].filter(Boolean).join(' · ')
            : '收起为悬浮球'
        }
        onClick={() => setOrbOnly(!orbOnly)}
        className="shrink-0 rounded-full focus-visible:outline-brand"
      >
        <span
          className={cn(
            'grid size-11 shrink-0 place-items-center rounded-full ring-1 ring-inset',
            {
              working: 'bg-brand-soft text-brand ring-brand/20',
              caution:
                risk === 'high'
                  ? 'bg-danger-soft text-danger ring-danger/20'
                  : 'bg-warning-soft text-warning ring-warning/20',
              complete: 'bg-success-soft text-success ring-success/20',
              waiting: 'bg-warning-soft text-warning ring-warning/20',
              error: 'bg-danger-soft text-danger ring-danger/20',
              idle: 'bg-page text-muted-ink ring-separator',
            }[signal],
          )}
        >
          <Signal state={signal} />
        </span>
      </button>
      {!orbOnly && (
        <>
          <button
            type="button"
            ref={toggleRef}
            aria-label="展开 Agent 实时状态"
            aria-expanded={open}
            aria-controls={panelId}
            aria-describedby={panelId + '-brief'}
            onClick={onToggle}
            className="group flex min-h-11 min-w-0 flex-1 items-center gap-1 rounded-lg px-2 text-left hover:text-brand focus-visible:outline-brand"
          >
            <span id={panelId + '-brief'} className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <strong className="truncate text-body font-semibold">{title}</strong>
                {line !== stateLabel && (
                  <span className="shrink-0 text-caption text-muted-ink">{stateLabel}</span>
                )}
              </span>
              <span
                className={cn(
                  'mt-0.5 block truncate text-caption leading-4',
                  flagged ? (risk === 'high' ? 'text-danger' : 'text-warning') : 'text-muted-ink',
                )}
              >
                {line}
              </span>
            </span>
            <ChevronRight size={13} className="shrink-0 text-muted-ink group-hover:text-brand" />
          </button>
          {(startAvailable || starting) && (
            <button
              type="button"
              aria-label="发起新研判"
              disabled={starting}
              onClick={onStart}
              className="inline-flex min-h-9 shrink-0 items-center gap-1 whitespace-nowrap border-l border-separator px-2.5 font-semibold text-brand hover:underline underline-offset-4 focus-visible:outline-brand disabled:opacity-60"
            >
              <Plus size={14} />
              {starting ? '排队中' : '新研判'}
            </button>
          )}
        </>
      )}
      <div hidden={orbOnly} ref={actionRef} className="max-w-[52%] empty:hidden" />
    </section>
  );
}
