/**
 * 业务侧 Agent 的常驻状态卡：点阵信号、执行状态与计时、正在进行的动作，以及研判四阶段进度，
 * 并提供「发起任务」入口。`open` 为真时自身不渲染，
 * 展开态由 {@link BusinessAgentPanel} 的工作区承担。
 *
 * 契约类型来自 `@capability-hub/contracts`，活动事实由 `activity.js` 的 `activityItems` 归并得到；
 * 本文件不发请求。
 */
import { useEffect, useState, type RefObject } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import type { AiExecutionResponse, AiExecutionViewResponse } from '@capability-hub/contracts';
import {
  BookOpen,
  ChevronRight,
  Compass,
  FileText,
  FolderOpen,
  GitCompareArrows,
  MessageSquare,
  Plug,
  Plus,
  ScrollText,
  Search,
  ShieldCheck,
  Sparkles,
  Wrench,
  type IconComponent,
} from '../../shared/icons/lucide.js';
import { cn } from '../../shared/styles/cn.js';
import { activityItems } from './activity.js';
import { PhaseTrack, phaseLabel } from './PhaseTrack.js';
import { eventLabel, jsonObject, statusLabels, toolLabels } from './presentation.js';

type Status = AiExecutionResponse['status'];
type Glyph = 'work' | 'read' | 'search' | 'browse' | 'think' | 'report';
const riskLabels: Record<string, string> = {
  low: '较低风险',
  medium: '需要关注',
  high: '高风险',
  unknown: '证据有限',
};

function reportOf(view?: AiExecutionViewResponse) {
  const report =
    view?.execution.result ??
    view?.artifacts.find((a) => a.name === 'assessment')?.content ??
    jsonObject(view?.interactions.find((i) => i.status === 'pending')?.request).assessment;
  const assessment = jsonObject(jsonObject(report).assessment);
  return {
    risk: typeof assessment.risk === 'string' ? assessment.risk : '',
    findings: Array.isArray(assessment.findings) ? assessment.findings.length : undefined,
  };
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
  return '';
}

const tools: Record<string, { Icon: IconComponent; glyph: Glyph }> = {
  'publication-scenarios': { Icon: Compass, glyph: 'search' },
  'resource-overview': { Icon: BookOpen, glyph: 'read' },
  'mcp-declarations': { Icon: Plug, glyph: 'read' },
  'list-files': { Icon: FolderOpen, glyph: 'browse' },
  'read-file': { Icon: FileText, glyph: 'read' },
  'search-files': { Icon: Search, glyph: 'search' },
  'scan-findings': { Icon: ShieldCheck, glyph: 'browse' },
  'compare-release': { Icon: GitCompareArrows, glyph: 'browse' },
  'read-feedback': { Icon: MessageSquare, glyph: 'read' },
};

/** 流式文本里最新的一句：去掉 Markdown 标记，使状态卡跟随 Agent 当前的思路而不是截断的段尾。 */
function latestThought(text: string) {
  const sentence = text
    .split(/(?<=[。！？!?；\n])/)
    .map((part) =>
      part
        .replace(/[*_`#>]/g, '')
        .replace(/^\s*(?:[-+]|\d+\.)\s+/, '')
        .trim(),
    )
    .filter(Boolean)
    .at(-1);
  return sentence ?? '';
}

interface Action {
  key: string;
  label: string;
  detail?: string;
  Icon: IconComponent;
  glyph: Glyph;
}

/** 运行中的最近动作：报告整理优先，其次是最新的工具调用或流式思考，最后回退到步骤事件。 */
function liveAction(view: AiExecutionViewResponse): Action {
  const activity = activityItems(view).at(-1);
  const step = [...view.activity].reverse().find((e) => e.type.startsWith('step.'));
  if (
    step?.data.step_id === 'assessment' ||
    (activity?.kind === 'message' && activity.block.message_id.startsWith('assessment:'))
  )
    return { key: 'assessment', label: '整理研判报告', Icon: ScrollText, glyph: 'report' };
  if (activity?.kind === 'tool') {
    const tool = tools[activity.name];
    return {
      key: activity.id,
      label: toolLabels[activity.name] ?? activity.name,
      detail: activity.display,
      Icon: tool?.Icon ?? Wrench,
      glyph: tool?.glyph ?? 'work',
    };
  }
  const thought = activity?.kind === 'message' ? latestThought(activity.block.text) : '';
  if (activity?.kind === 'message' && thought)
    return { key: activity.id, label: thought, Icon: Sparkles, glyph: 'think' };
  return {
    key: 'step',
    label: (step && eventLabel(step)) || '正在查阅证据',
    Icon: Search,
    glyph: 'work',
  };
}

function useNow(live: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!live) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [live]);
  return now;
}

function clock(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = String(total % 60).padStart(2, '0');
  return minutes >= 60
    ? `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}:${seconds}`
    : `${minutes}:${seconds}`;
}

const signals = {
  work: ['00100', '01101', '11111', '11111', '11111'],
  read: ['11111', '00000', '11110', '00000', '11100'],
  search: ['01100', '10010', '10010', '01100', '00011'],
  browse: ['11000', '11111', '10001', '10001', '11111'],
  think: ['00100', '01010', '10101', '01010', '00100'],
  report: ['11111', '10001', '11111', '10001', '11111'],
  waiting: ['01010', '01010', '01010', '01010', '01010'],
  complete: ['00000', '00001', '00010', '10100', '01000'],
  caution: ['00100', '00100', '00100', '00000', '00100'],
  error: ['10001', '01010', '00100', '01010', '10001'],
  idle: ['00000', '00000', '10101', '00000', '00000'],
};

/** 5×5 点阵：运行中的图形随当前动作变化并做对角波动，其余状态切换时逐点浮现。 */
function Signal({ pattern, live }: { pattern: keyof typeof signals; live: boolean }) {
  return (
    <span aria-hidden="true" className="relative grid grid-cols-5 gap-[2px]">
      {signals[pattern].flatMap((row, y) =>
        [...row].map((dot, x) => (
          <span
            key={y * 5 + x}
            className={cn(
              'size-[3px] rounded-full bg-current',
              dot === '0' && 'opacity-15',
              live
                ? dot === '1' && 'motion-safe:animate-[agent-signal_1.4s_ease-in-out_infinite]'
                : 'motion-safe:animate-[agent-dot-in_.32s_var(--ease-out)_both]',
            )}
            style={{ animationDelay: live ? `${x * 145 - y * 95}ms` : `${(x + y) * 28}ms` }}
          />
        )),
      )}
    </span>
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
  emptyLabel,
  error,
  open,
  toggleRef,
  panelId,
  onToggle,
}: {
  /** 为假时禁发起，通常因目录未加载、无可用模型或已有执行处于排队/运行/待确认。 */
  startAvailable: boolean;
  starting: boolean;
  onStart: () => void;
  /** 供父级注入「快速采纳」浮层的挂载点，出现在状态卡右侧。 */
  actionRef: (slot: HTMLDivElement | null) => void;
  view?: AiExecutionViewResponse;
  status?: Status;
  title: string;
  /** `status` 缺失时替代状态文案，用于区分「尚未发起」与「正在连接」。 */
  emptyLabel: string;
  error: string;
  /** 为真时不渲染自身，由父级展示展开面板。 */
  open: boolean;
  toggleRef: RefObject<HTMLButtonElement | null>;
  /** 展开面板的 DOM id，用于 `aria-controls` 关联。 */
  panelId: string;
  onToggle: () => void;
}) {
  const [orbOnly, setOrbOnly] = useState(false);
  const reducedMotion = useReducedMotion();
  const live = !error && (status === 'running' || status === 'queued');
  const now = useNow(live && !open);
  if (open) return null;
  const { risk, findings } = reportOf(view);
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
          : live
            ? 'working'
            : 'idle';
  const stateLabel = error
    ? '需要处理'
    : status === 'waiting_input'
      ? '等待你的确认'
      : status
        ? statusLabels[status]
        : emptyLabel;
  const action = !error && status === 'running' && view ? liveAction(view) : undefined;
  const line = error || briefLine(view, status, risk) || stateLabel;
  const pattern = signal === 'working' ? (action?.glyph ?? 'work') : signal;
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
  const lastEvent = view?.activity.at(-1)?.seq;
  return (
    <section
      aria-label="Agent 任务简报"
      className={cn(
        'pointer-events-auto relative flex max-w-full items-center bg-paper text-ink shadow-overlay',
        orbOnly
          ? 'size-11 justify-center rounded-full'
          : 'w-[min(372px,calc(100vw_-_32px))] gap-1 rounded-[28px] border border-separator p-1.5',
        !orbOnly &&
          {
            working:
              'bg-[linear-gradient(100deg,var(--brand-soft),var(--paper)_42%)] border-brand/20',
            waiting:
              'bg-[linear-gradient(100deg,var(--warning-soft),var(--paper)_42%)] border-warning/30',
            error: 'bg-[linear-gradient(100deg,var(--danger-soft),var(--paper)_42%)]',
            caution: '',
            complete: '',
            idle: '',
          }[signal],
      )}
    >
      <button
        type="button"
        aria-expanded={!orbOnly}
        aria-label={orbOnly ? '展开 Agent 状态条' : '收起为悬浮球'}
        title={
          orbOnly
            ? [title, stateLabel, action?.label ?? (line !== stateLabel && line)]
                .filter(Boolean)
                .join(' · ')
            : '收起为悬浮球'
        }
        onClick={() => setOrbOnly(!orbOnly)}
        className={cn('relative shrink-0 rounded-full focus-visible:outline-brand', tone)}
      >
        {signal === 'waiting' && (
          <span
            aria-hidden="true"
            className="absolute inset-0 rounded-full border-2 border-current motion-safe:animate-[agent-halo_1.8s_var(--ease-out)_infinite]"
          />
        )}
        {signal === 'working' && lastEvent !== undefined && (
          <span
            key={lastEvent}
            aria-hidden="true"
            className="absolute inset-0 rounded-full bg-current opacity-0 motion-safe:animate-[agent-blip_.7s_var(--ease-out)]"
          />
        )}
        <span
          className={cn(
            'relative grid size-11 shrink-0 place-items-center rounded-full ring-1 ring-inset',
            {
              working: 'bg-brand-soft ring-brand/20',
              caution:
                risk === 'high'
                  ? 'bg-danger-soft ring-danger/20'
                  : 'bg-warning-soft ring-warning/20',
              complete: 'bg-success-soft ring-success/20',
              waiting: 'bg-warning-soft ring-warning/20',
              error: 'bg-danger-soft ring-danger/20',
              idle: 'bg-page ring-separator',
            }[signal],
          )}
        >
          {signal === 'working' && (
            <span
              aria-hidden="true"
              className="absolute inset-0 rounded-full border-2 border-transparent border-t-current opacity-70 motion-safe:animate-[spin_1.8s_linear_infinite]"
            />
          )}
          <Signal key={pattern} pattern={pattern} live={signal === 'working'} />
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
            className="group flex min-h-11 min-w-0 flex-1 items-center gap-1 rounded-2xl px-2 py-0.5 text-left focus-visible:outline-brand"
          >
            <span id={panelId + '-brief'} className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="flex items-center gap-2">
                <strong className="truncate text-body font-semibold group-hover:text-brand">
                  {title}
                </strong>
                {line !== stateLabel || action ? (
                  <span
                    className={cn(
                      'inline-flex shrink-0 items-center gap-1 text-caption font-medium',
                      tone,
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        'size-1.5 rounded-full bg-current',
                        live && 'motion-safe:animate-pulse',
                      )}
                    />
                    {stateLabel}
                  </span>
                ) : null}
                {elapsed && (
                  <span
                    className="ml-auto shrink-0 font-mono text-caption tabular-nums text-muted-ink"
                    title="已运行时长"
                  >
                    {elapsed}
                  </span>
                )}
              </span>
              {action ? (
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
                      phaseLabel(view),
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
