/**
 * 业务侧 Agent 的常驻状态卡，两种形态共用同一组推导：
 * - 胶囊（默认）：点阵、状态与计时、当前动作、研判四阶段进度压缩在三行内；
 * - 侧边卡（`docked`）：停靠在抽屉左侧时使用空闲的纵向空间，追加带文字的阶段、最近动作、
 *   研判结论与待确认问题。
 * 两种形态都可收起为悬浮球，并提供「发起任务」入口。`open` 为真时自身不渲染，
 * 展开态由 {@link BusinessAgentPanel} 的工作区承担。
 *
 * 契约类型来自 `@capability-hub/contracts`，活动事实由 `activity.js` 的 `activityItems` 归并得到；
 * 本文件不发请求。
 */
import { useEffect, useState, type ReactNode, type RefObject } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import type { AiExecutionResponse, AiExecutionViewResponse } from '@capability-hub/contracts';
import {
  Check,
  ChevronRight,
  CirclePause,
  LoaderCircle,
  Plus,
  X,
} from '../../shared/icons/lucide.js';
import { cn } from '../../shared/styles/cn.js';
import { activityItems } from './activity.js';
import {
  briefLine,
  clock,
  liveAction,
  recentTrail,
  reportOf,
  riskLabels,
  type BriefAction,
  type TrailItem,
} from './agent-brief.js';
import { AgentSignal, type BriefSignal } from './AgentSignal.js';
import { PhaseTrack, phaseLabel } from './PhaseTrack.js';
import { ReadOnlyBadge } from './ReadOnlyBadge.js';
import { jsonObject, statusLabels } from './presentation.js';

type Status = AiExecutionResponse['status'];

function useNow(live: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!live) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [live]);
  return now;
}

/** 当前动作的一行：思考类贴右显示最新的字并在左侧淡出，其余为「动作名 + 对象」。 */
function ActionLine({ action }: { action: BriefAction }) {
  const reducedMotion = useReducedMotion();
  return (
    <motion.span
      key={action.key}
      initial={reducedMotion ? false : { opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22 }}
      className="flex min-w-0 items-center gap-1.5 text-caption leading-4"
    >
      <action.Icon size={12} className="shrink-0 text-brand" />
      {action.glyph === 'think' ? (
        <span
          className={cn(
            'flex min-w-0 flex-1 justify-end overflow-hidden whitespace-nowrap text-muted-ink',
            action.label.length > 20 &&
              '[mask-image:linear-gradient(to_right,transparent,var(--mask-solid)_18px)]',
          )}
        >
          <span className="shrink-0 grow">{action.label}</span>
        </span>
      ) : (
        <span className="min-w-0 flex-1 truncate">
          <span className="font-medium text-ink">{action.label}</span>
          {action.detail && (
            <span className="ml-1.5 font-mono text-muted-ink">{action.detail}</span>
          )}
        </span>
      )}
    </motion.span>
  );
}

const trailStates: Record<TrailItem['state'], { mark: string; badge: ReactNode }> = {
  running: {
    mark: 'bg-brand-soft text-brand',
    badge: <LoaderCircle size={12} className="text-brand motion-safe:animate-spin" />,
  },
  completed: {
    mark: 'bg-page text-muted-ink',
    badge: <Check size={12} className="text-success" />,
  },
  failed: { mark: 'bg-danger-soft text-danger', badge: <X size={12} className="text-danger" /> },
  interrupted: {
    mark: 'bg-page text-muted-ink',
    badge: <CirclePause size={12} className="text-muted-ink" />,
  },
  waiting: {
    mark: 'bg-warning-soft text-warning',
    badge: <CirclePause size={12} className="text-warning" />,
  },
};

/** 侧边卡的最近动作列表；新条目自下方浮入，正在进行的一条高亮。 */
function Trail({ items }: { items: TrailItem[] }) {
  const reducedMotion = useReducedMotion();
  return (
    <ol className="space-y-2">
      {items.map((item) => {
        const state = trailStates[item.state];
        return (
          <motion.li
            key={item.id}
            initial={reducedMotion ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22 }}
            className="flex items-start gap-2.5"
          >
            <span className={cn('grid size-6 shrink-0 place-items-center rounded-lg', state.mark)}>
              <item.Icon size={13} />
            </span>
            <span className="min-w-0 flex-1 pt-0.5 text-caption leading-5">
              {item.thought ? (
                <span className="line-clamp-2 text-muted-ink">“{item.label}”</span>
              ) : (
                <span className="block truncate">
                  <span className={cn('font-medium', item.state === 'running' && 'text-brand')}>
                    {item.label}
                  </span>
                  {item.detail && (
                    <span className="ml-1.5 font-mono text-muted-ink">{item.detail}</span>
                  )}
                </span>
              )}
            </span>
            <span className="flex shrink-0 items-center gap-1 pt-1 text-caption tabular-nums text-muted-ink">
              {item.state === 'completed' && item.duration !== undefined
                ? `${(item.duration / 1000).toFixed(1)}s`
                : state.badge}
            </span>
          </motion.li>
        );
      })}
    </ol>
  );
}

/**
 * 状态卡：`error` 优先于活动摘要展示；`startAvailable` 为假时按钮禁用但保留入口，
 * 以免用户在等模型配置或上一任务仍在跑时重复发起。计时只在排队与运行时走动。
 */
export function AgentBrief({
  actionRef,
  startAvailable,
  starting,
  onStart,
  view,
  status,
  title,
  readOnly,
  emptyLabel,
  error,
  open,
  docked = false,
  toggleRef,
  panelId,
  onToggle,
}: {
  /** 为假时禁发起，通常因目录未加载、无可用模型或已有执行处于排队/运行/待确认。 */
  startAvailable: boolean;
  starting: boolean;
  onStart: () => void;
  /** 供父级注入「快速采纳」浮层的挂载点，出现在状态卡右侧或侧边卡底部。 */
  actionRef: (slot: HTMLDivElement | null) => void;
  view?: AiExecutionViewResponse;
  status?: Status;
  title: string;
  readOnly: boolean;
  /** `status` 缺失时替代状态文案，用于区分「尚未发起」与「正在连接」。 */
  emptyLabel: string;
  error: string;
  /** 为真时不渲染自身，由父级展示展开面板。 */
  open: boolean;
  /** 停靠在抽屉左侧、纵向空间充足时为真，切换为侧边卡形态。 */
  docked?: boolean;
  toggleRef: RefObject<HTMLButtonElement | null>;
  /** 展开面板的 DOM id，用于 `aria-controls` 关联。 */
  panelId: string;
  onToggle: () => void;
}) {
  const [orbOnly, setOrbOnly] = useState(false);
  const live = !error && (status === 'running' || status === 'queued');
  const now = useNow(live && !open);
  if (open) return null;
  const { risk, findings, summary } = reportOf(view);
  const flagged = status === 'succeeded' && (risk === 'high' || risk === 'medium');
  const signal: BriefSignal =
    error || status === 'failed' || status === 'timed_out'
      ? 'error'
      : status === 'waiting_input'
        ? 'waiting'
        : status === 'succeeded'
          ? flagged
            ? 'caution'
            : 'complete'
          : live
            ? 'working'
            : 'idle';
  const stateLabel = error
    ? '需要处理'
    : status === 'waiting_input'
      ? readOnly
        ? '等待负责人确认'
        : '等待你的确认'
      : status
        ? statusLabels[status]
        : emptyLabel;
  const action = !error && status === 'running' && view ? liveAction(view) : undefined;
  const line = error || briefLine(view, status, risk) || stateLabel;
  const decisionLabel = readOnly ? '等待负责人决定' : '等待你的决定';
  const started =
    view?.activity.find((event) => event.type === 'execution.started')?.occurred_at ??
    view?.execution.created_at;
  const elapsed = live && started ? clock(now - Date.parse(started)) : '';
  const toolCount = view ? activityItems(view).filter((item) => item.kind === 'tool').length : 0;
  const tone = {
    working: 'text-brand',
    caution: risk === 'high' ? 'text-danger' : 'text-warning',
    complete: 'text-success',
    waiting: 'text-warning',
    error: 'text-danger',
    idle: 'text-muted-ink',
  }[signal];
  const wash = {
    working: 'bg-[linear-gradient(100deg,var(--brand-soft),var(--paper)_42%)] border-brand/20',
    waiting: 'bg-[linear-gradient(100deg,var(--warning-soft),var(--paper)_42%)] border-warning/30',
    error: 'bg-[linear-gradient(100deg,var(--danger-soft),var(--paper)_42%)]',
    caution: '',
    complete: '',
    idle: '',
  }[signal];
  const side = docked && !orbOnly;
  const orb = (
    <button
      type="button"
      aria-expanded={!orbOnly}
      aria-label={orbOnly ? '展开 Agent 状态条' : '收起为悬浮球'}
      title={
        orbOnly
          ? [title, readOnly && '只读', stateLabel, action?.label ?? (line !== stateLabel && line)]
              .filter(Boolean)
              .join(' · ')
          : '收起为悬浮球'
      }
      onClick={() => setOrbOnly(!orbOnly)}
      className={cn('shrink-0 rounded-full focus-visible:outline-brand', tone)}
    >
      <AgentSignal
        signal={signal}
        glyph={action?.glyph}
        risk={risk}
        pulse={view?.activity.at(-1)?.seq}
        large={side}
      />
    </button>
  );
  const startButton = (startAvailable || starting) && (
    <button
      type="button"
      aria-label="发起新研判"
      disabled={starting}
      onClick={onStart}
      className={cn(
        'inline-flex min-h-9 shrink-0 items-center gap-1 whitespace-nowrap px-2.5 font-semibold text-brand hover:underline underline-offset-4 focus-visible:outline-brand disabled:opacity-60',
        !side && 'border-l border-separator',
      )}
    >
      <Plus size={14} />
      {starting ? '排队中' : '新研判'}
    </button>
  );
  const stateChip = (
    <span className={cn('inline-flex shrink-0 items-center gap-1 text-caption font-medium', tone)}>
      <span
        aria-hidden="true"
        className={cn('size-1.5 rounded-full bg-current', live && 'motion-safe:animate-pulse')}
      />
      {stateLabel}
    </span>
  );
  const timer = elapsed && (
    <span
      className="ml-auto shrink-0 font-mono text-caption tabular-nums text-muted-ink"
      title="已运行时长"
    >
      {elapsed}
    </span>
  );

  if (side) {
    const trail = view ? recentTrail(view) : [];
    const question = jsonObject(
      view?.interactions.find((item) => item.status === 'pending')?.request,
    ).question;
    const failure = error || view?.execution.error?.message;
    const reported =
      (status === 'waiting_input' || status === 'succeeded') && (summary || findings !== undefined);
    return (
      <section
        aria-label="Agent 任务简报"
        className={cn(
          'pointer-events-auto flex max-h-[calc(100dvh_-_40px)] w-[400px] max-w-full flex-col overflow-hidden rounded-3xl border border-separator bg-paper text-ink shadow-overlay',
          signal === 'working' && 'border-brand/20',
          signal === 'waiting' && 'border-warning/30',
        )}
      >
        <header className={cn('flex shrink-0 items-center gap-3.5 px-4 pt-4 pb-3.5', wash)}>
          {orb}
          <div id={panelId + '-brief'} className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <strong className="truncate text-section">{title}</strong>
              {readOnly && <ReadOnlyBadge />}
              {timer}
            </div>
            <p className="mt-1 flex min-w-0 items-center gap-1.5">
              {stateChip}
              {line !== stateLabel && line !== failure && (
                <span
                  className={cn(
                    'truncate text-caption',
                    flagged ? (risk === 'high' ? 'text-danger' : 'text-warning') : 'text-muted-ink',
                  )}
                >
                  · {line}
                </span>
              )}
            </p>
            {action && (
              <span className="mt-1.5 block">
                <ActionLine action={action} />
              </span>
            )}
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-width:thin]">
          {view && !error && <PhaseTrack view={view} labeled className="px-4 pt-1 pb-4" />}
          {question && typeof question === 'string' && (
            <section
              aria-label={decisionLabel}
              className="mx-4 mb-3 rounded-2xl border border-warning/25 bg-warning-soft/60 p-3 text-caption"
            >
              <p className="flex items-center gap-1.5 font-semibold text-warning">
                <CirclePause size={13} />
                {decisionLabel}
              </p>
              <p className="mt-1 leading-5 text-ink">{question}</p>
            </section>
          )}
          {failure && (
            <p className="mx-4 mb-3 rounded-2xl bg-danger-soft p-3 text-caption leading-5 text-danger">
              {failure}
            </p>
          )}
          {reported && (
            <section
              aria-label="研判结论"
              className="border-t border-separator px-4 py-3 text-caption"
            >
              <div className="mb-2 flex items-center gap-2">
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 font-semibold',
                    risk === 'high'
                      ? 'bg-danger-soft text-danger'
                      : risk === 'medium'
                        ? 'bg-warning-soft text-warning'
                        : 'bg-success-soft text-success',
                  )}
                >
                  {riskLabels[risk] ?? '待核实'}
                </span>
                {findings !== undefined && (
                  <span className="text-muted-ink">{findings} 项发现</span>
                )}
              </div>
              {summary && <p className="line-clamp-4 leading-5 text-ink">{summary}</p>}
            </section>
          )}
          {trail.length > 0 && (
            <section aria-label="最近动作" className="border-t border-separator px-4 py-3">
              <h3 className="mb-2.5 flex items-center justify-between text-caption font-medium text-muted-ink">
                最近动作
                {toolCount > 0 && <span className="font-normal">共 {toolCount} 次查阅</span>}
              </h3>
              <Trail items={trail} />
            </section>
          )}
        </div>
        <footer className="flex shrink-0 items-center gap-2 border-t border-separator bg-page/40 px-3 py-2.5">
          <button
            type="button"
            ref={toggleRef}
            aria-label="展开 Agent 实时状态"
            aria-expanded={open}
            aria-controls={panelId}
            aria-describedby={panelId + '-brief'}
            onClick={onToggle}
            className="group inline-flex min-h-9 items-center gap-1 rounded-full px-2.5 font-semibold hover:text-brand focus-visible:outline-brand"
          >
            查看完整过程
            <ChevronRight
              size={13}
              className="transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
            />
          </button>
          <div className="ml-auto flex items-center gap-1">
            <div ref={actionRef} className="empty:hidden" />
            {startButton}
          </div>
        </footer>
      </section>
    );
  }

  return (
    <section
      aria-label="Agent 任务简报"
      className={cn(
        'pointer-events-auto relative flex max-w-full items-center bg-paper text-ink shadow-overlay',
        orbOnly
          ? 'size-11 justify-center rounded-full'
          : cn(
              'w-[min(372px,calc(100vw_-_32px))] gap-1 rounded-[28px] border border-separator p-1.5',
              wash,
            ),
      )}
    >
      {orb}
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
            className="group flex min-h-11 min-w-0 flex-1 items-center gap-1 rounded-2xl px-2 py-0.5 text-left focus-visible:outline-brand"
          >
            <span id={panelId + '-brief'} className="flex min-w-0 flex-1 flex-col gap-1">
              <span className={cn('flex items-center gap-2', readOnly && 'flex-wrap gap-y-1')}>
                <strong className="truncate text-body font-semibold group-hover:text-brand">
                  {title}
                </strong>
                {readOnly && <ReadOnlyBadge />}
                {(line !== stateLabel || action) && stateChip}
                {timer}
              </span>
              {action ? (
                <ActionLine action={action} />
              ) : (
                <span
                  className={cn(
                    'block truncate text-caption leading-4',
                    flagged ? (risk === 'high' ? 'text-danger' : 'text-warning') : 'text-muted-ink',
                  )}
                >
                  {line}
                </span>
              )}
              {view && !error && (
                <span className={cn('flex items-center gap-2 text-caption', tone)}>
                  <PhaseTrack view={view} />
                  <span className="min-w-0 truncate text-muted-ink">
                    {[
                      live && phaseLabel(view),
                      toolCount > 0 && `${toolCount} 次查阅`,
                      findings !== undefined && `${findings} 项发现`,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </span>
              )}
            </span>
            <ChevronRight
              size={13}
              className="shrink-0 text-muted-ink transition-transform group-hover:translate-x-0.5 group-hover:text-brand motion-reduce:transition-none"
            />
          </button>
          {startButton}
        </>
      )}
      <div hidden={orbOnly} ref={actionRef} className="max-w-[52%] empty:hidden" />
    </section>
  );
}
