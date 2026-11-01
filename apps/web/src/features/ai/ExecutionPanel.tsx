/**
 * 执行面板：把一份执行视图拆成「协作过程／成果／运行详情」三个页签，并承载取消任务与人工确认入口。
 * 视图、连接状态与刷新回调都由调用方注入（独立页面与侧栏浮层共用），写操作经 `{@link useAiCommand}`
 * 提交，因此这里的取消请求同样带幂等键与版本前置条件。
 */
import { useEffect, useRef, useId, useState, type ReactNode } from 'react';
import {
  aiExecutionViewResponseSchema,
  type AiExecutionViewResponse,
} from '@capability-hub/contracts';
import { api } from '../../shared/api/client.js';
import { useAiCommand } from './use-ai-command.js';
import { PageTabs } from '../../shared/components/PageTabs.js';
import {
  Activity,
  ArrowRight,
  CirclePause,
  FileText,
  Workflow,
  SquareTerminal,
  X,
} from '../../shared/icons/lucide.js';
import { btnStyles } from '../../shared/styles/recipes.js';
import { cn } from '../../shared/styles/cn.js';
import { ExecutionDetails } from './ExecutionDetails.js';
import { ExecutionResult } from './ExecutionResult.js';
import { ExecutionStatus } from './ExecutionStatus.js';
import { ActivityFeed } from './ActivityFeed.js';
import { executionTitle, jsonObject, operationLabels } from './presentation.js';
import { fillStyles, scrollStyles } from './styles.js';

type Tab = 'activity' | 'result' | 'details';

/**
 * 执行视图的交互外壳：页签切换、状态徽标、错误提示、取消与「前往确认」。
 *
 * 紧凑模式下首次变为可见时按当前状态自动定位页签（成功切「成果」、待确认切「协作过程」并递增
 * `focusRequest` 让活动流滚到待确认项），之后不再自动跳转，避免用户切页时被打断。取消前会先拉取
 * 最新快照取 `revision`，任务已结束就不发请求；失败文案写在面板顶部，不覆盖执行自身的错误。
 */
export function ExecutionPanel({
  view,
  canManage,
  connection,
  onRefresh,
  compact = false,
  visible = true,
}: {
  view: AiExecutionViewResponse;
  /** 是否展示写操作（取消、确认）入口，由调用方按权限计算。 */
  canManage: boolean;
  /** 实时连接状态文案，仅用于底部状态条，不参与逻辑。 */
  connection: string;
  /** 取消成功后触发，由调用方重新拉取视图。 */
  onRefresh: () => void;
  /** 侧栏浮层模式：隐藏操作类型行、缩小标题，并在首次可见时自动选页签。 */
  compact?: boolean;
  /** 面板当前是否处于可见容器内；为假时停止活动流的自动滚动与流式动画。 */
  visible?: boolean;
}) {
  const { execution } = view;
  const pending = view.interactions.find(
    (item) => item.status === 'pending' && execution.status === 'waiting_input',
  );
  const showResult =
    execution.operation_id !== 'assistant' ||
    view.artifacts.length > 0 ||
    (execution.result !== null && typeof jsonObject(execution.result).text !== 'string');
  const resultReady = execution.result !== null || view.artifacts.length > 0;
  const [tab, setChoice] = useState<Tab>('activity');
  const [focusRequest, setFocusRequest] = useState(0);
  const entered = useRef(false);
  useEffect(() => {
    if (compact && visible && !entered.current) {
      if (execution.status === 'succeeded') setChoice('result');
      if (execution.status === 'waiting_input') {
        setChoice('activity');
        setFocusRequest((value) => value + 1);
      }
    }
    entered.current = visible;
  }, [compact, visible, execution.status]);
  const panelId = useId();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const command = useAiCommand();
  const active = ['queued', 'running', 'waiting_input'].includes(execution.status);
  const items: { id: Tab; label: ReactNode }[] = [
    {
      id: 'activity',
      label: (
        <>
          <Workflow size={14} />
          协作过程
        </>
      ),
    },
    ...(showResult
      ? [
          {
            id: 'result' as const,
            label: (
              <>
                <FileText size={14} />
                成果{resultReady && <span className="size-1.5 rounded-full bg-brand" />}
              </>
            ),
          },
        ]
      : []),
    {
      id: 'details',
      label: (
        <>
          <Activity size={14} />
          运行详情
        </>
      ),
    },
  ];
  const cancel = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const latest = aiExecutionViewResponseSchema.parse(
        await api(`/api/ai/executions/${execution.id}`),
      );
      if (['queued', 'running', 'waiting_input'].includes(latest.execution.status))
        await command(`/api/ai/executions/${execution.id}/cancel`, {}, latest.execution.revision);
      onRefresh();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '取消失败');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className={cn(fillStyles, '@container/execution')}>
      <header className="shrink-0 border-b border-[color:var(--line)] bg-paper px-5 pt-5 sm:px-7">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            {!compact && (
              <p className="mb-2 flex items-center gap-2 text-caption text-muted-ink">
                <SquareTerminal size={14} />
                {operationLabels[execution.operation_id] ?? execution.operation_id}
                <span aria-hidden="true">/</span>
                {new Date(execution.created_at).toLocaleDateString()}
              </p>
            )}
            <h2
              className={cn(
                'line-clamp-2 leading-snug',
                compact ? 'text-body font-semibold' : 'text-section',
              )}
              title={executionTitle(execution)}
            >
              {executionTitle(execution)}
            </h2>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2">
            <ExecutionStatus status={execution.status} />
            {active && canManage && (
              <button
                type="button"
                className="flex items-center gap-1 rounded px-1 py-1 text-caption text-muted-ink hover:text-danger"
                disabled={busy}
                onClick={() => {
                  void cancel();
                }}
              >
                <X size={13} />
                {busy ? '正在取消…' : '取消任务'}
              </button>
            )}
          </div>
        </div>
        <div className="mt-3 [&>nav]:mb-0 [&>nav]:border-b-0">
          <PageTabs
            items={items}
            value={tab}
            label="任务视图"
            onValueChange={setChoice}
            panelId={panelId}
          />
        </div>
      </header>
      {(error || execution.error) && (
        <p
          role="alert"
          className="shrink-0 border-b border-[color:var(--line)] bg-danger-soft px-5 py-3 text-danger"
        >
          {error || execution.error?.message}
        </p>
      )}
      {pending && (
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[color:var(--line)] bg-warning-soft px-5 py-3 text-warning">
          <span className="flex items-center gap-2">
            <CirclePause size={16} />
            <span>{canManage ? '任务已暂停，等待你的确认。' : '任务已暂停，等待发起人确认。'}</span>
          </span>
          {canManage && (
            <button
              type="button"
              className="inline-flex shrink-0 items-center gap-1 rounded px-2 py-1 font-semibold"
              onClick={() => {
                setChoice('activity');
                setFocusRequest((value) => value + 1);
              }}
            >
              前往确认
              <ArrowRight size={14} />
            </button>
          )}
        </div>
      )}
      <section
        id={`${panelId}-activity`}
        role="tabpanel"
        aria-labelledby={`${panelId}-tab-activity`}
        hidden={tab !== 'activity'}
        className={cn(fillStyles, tab !== 'activity' && 'hidden')}
      >
        <ActivityFeed
          view={view}
          canManage={canManage}
          active={visible && tab === 'activity'}
          onRefresh={onRefresh}
          focusRequest={focusRequest}
        />
      </section>
      {showResult && (
        <section
          id={`${panelId}-result`}
          role="tabpanel"
          aria-labelledby={`${panelId}-tab-result`}
          tabIndex={0}
          hidden={tab !== 'result'}
          className={cn(scrollStyles, tab !== 'result' && 'hidden')}
        >
          <ExecutionResult view={view} />
        </section>
      )}
      <section
        id={`${panelId}-details`}
        role="tabpanel"
        aria-labelledby={`${panelId}-tab-details`}
        tabIndex={0}
        hidden={tab !== 'details'}
        className={cn(scrollStyles, tab !== 'details' && 'hidden')}
      >
        <ExecutionDetails view={view} events={view.activity} />
      </section>
      <footer className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-[color:var(--line)] bg-page/40 px-5 py-2.5 text-caption text-muted-ink">
        <span role="status" className="inline-flex items-center gap-2">
          <span
            className={cn(
              'size-1.5 rounded-full',
              execution.status === 'running'
                ? 'bg-brand motion-safe:animate-pulse'
                : 'bg-muted-ink/50',
            )}
          />
          {connection || '正在连接'}
        </span>
        {resultReady && showResult && tab === 'activity' ? (
          <button
            type="button"
            className={cn(
              btnStyles,
              'min-h-0 border-0 bg-transparent px-1 py-0 text-caption text-brand',
            )}
            onClick={() => setChoice('result')}
          >
            查看成果
            <ArrowRight size={13} />
          </button>
        ) : (
          <span>任务记录自动保存</span>
        )}
      </footer>
    </div>
  );
}
