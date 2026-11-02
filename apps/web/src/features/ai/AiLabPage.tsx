/**
 * AI 控制台页面：左侧任务记录（游标分页 + 本地筛选），右侧按 `?execution=` 切换执行详情，
 * 有执行权限且未选中任务时展示 {@link NewExecution} 新建表单。
 *
 * 数据来源：`/api/ai/catalog` 与 `/api/ai/executions`（游标分页，翻页结果按执行 id 去重合并），
 * 已选执行的实时进度由 {@link useAiExecution} 的 SSE 事件流维护；
 * 契约 schema 来自 `@capability-hub/contracts`。只读账号可以通过记录或链接查看任务。
 */
import { useEffect, useState } from 'react';
import {
  aiCatalogResponseSchema,
  aiExecutionListResponseSchema,
  type AiCatalogResponse,
  type AiExecutionResponse,
} from '@capability-hub/contracts';
import { api } from '../../shared/api/client.js';
import { PageHead } from '../../shared/components/PageHead.js';
import { useHub } from '../../shared/context/HubContext.js';
import { Bot, History, Plus, Search, Workflow } from '../../shared/icons/lucide.js';
import { navigate } from '../../shared/navigation/history-navigation.js';
import { btnStyles, btnPrimaryStyles } from '../../shared/styles/recipes.js';
import { cn } from '../../shared/styles/cn.js';
import { AgentSignal } from './AgentSignal.js';
import { ExecutionPanel } from './ExecutionPanel.js';
import { ExecutionStatus } from './ExecutionStatus.js';
import { NewExecution } from './NewExecution.js';
import { executionTitle, operationLabels, operationMeta } from './presentation.js';
import { useAiExecution } from './use-ai-execution.js';
import {
  controlStyles,
  fillStyles,
  historyGroupStyles,
  historyStyles,
  scrollStyles,
  sidebarStyles,
  workspaceStyles,
} from './styles.js';

function dayDistance(iso: string) {
  const start = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.round((start(new Date()).getTime() - start(new Date(iso)).getTime()) / 86400000);
}

/** 历史列表按本地日期分组；列表本身按创建时间倒序，因此相邻同组即可合并。 */
function dayGroup(iso: string) {
  const days = dayDistance(iso);
  return days <= 0 ? '今天' : days === 1 ? '昨天' : days < 7 ? '近 7 天' : '更早';
}

function timeLabel(iso: string) {
  const date = new Date(iso);
  return dayDistance(iso) <= 1
    ? date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleDateString(undefined, { month: '2-digit', day: '2-digit' });
}

const historyTones: Record<AiExecutionResponse['status'], string> = {
  queued: 'bg-brand-soft text-brand',
  running: 'bg-brand-soft text-brand',
  waiting_input: 'bg-warning-soft text-warning',
  succeeded: 'bg-paper text-muted-ink ring-1 ring-inset ring-[color:var(--line)]',
  failed: 'bg-danger-soft text-danger',
  cancelled: 'bg-paper text-muted-ink ring-1 ring-inset ring-[color:var(--line)]',
  timed_out: 'bg-danger-soft text-danger',
};

/**
 * 实验台外壳：`query` 为当前 location 的查询串，仅读取其中的 `execution` 参数；
 * 该参数变化即切换详情并重建事件流，历史列表也会随之重载以刷新状态徽标。
 */
export default function AiLabPage({ query }: { query: string }) {
  const { me } = useHub();
  const canExecute = !!me?.capabilities.can_ai;
  const selected = new URLSearchParams(query).get('execution') ?? '';
  const [catalog, setCatalog] = useState<AiCatalogResponse>();
  const [history, setHistory] = useState<AiExecutionResponse[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [draft, setDraft] = useState(0);
  const execution = useAiExecution(selected, refresh);
  const currentView = execution.view?.execution.id === selected ? execution.view : undefined;
  useEffect(() => {
    if (!canExecute) return;
    const controller = new AbortController();
    void api('/api/ai/catalog', { signal: controller.signal })
      .then((data) => setCatalog(aiCatalogResponseSchema.parse(data)))
      .catch((failure: unknown) => {
        if (!controller.signal.aborted)
          setError(failure instanceof Error ? failure.message : '加载失败');
      });
    return () => controller.abort();
  }, [canExecute]);
  useEffect(() => {
    const controller = new AbortController();
    void api('/api/ai/executions', { signal: controller.signal })
      .then((data) => {
        const result = aiExecutionListResponseSchema.parse(data);
        setHistory(result.items);
        setCursor(result.next_cursor);
        setHistoryLoading(false);
      })
      .catch((failure: unknown) => {
        if (!controller.signal.aborted) {
          setError(failure instanceof Error ? failure.message : '加载失败');
          setHistoryLoading(false);
        }
      });
    return () => controller.abort();
  }, [selected, refresh, execution.view?.execution.status]);
  const loadMore = async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = aiExecutionListResponseSchema.parse(
        await api(`/api/ai/executions?cursor=${encodeURIComponent(cursor)}`),
      );
      setHistory((rows) => [
        ...rows,
        ...page.items.filter((item) => !rows.some((row) => row.id === item.id)),
      ]);
      setCursor(page.next_cursor);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '加载失败');
    } finally {
      setLoadingMore(false);
    }
  };
  const openExecution = (id: string) => {
    setHistoryOpen(false);
    navigate(`/ai?execution=${encodeURIComponent(id)}`);
  };
  const newTask = () => {
    setDraft((value) => value + 1);
    setHistoryOpen(false);
    navigate('/ai');
  };
  const statusOf = (row: AiExecutionResponse) =>
    row.id === selected && currentView ? currentView.execution.status : row.status;
  const visible = history.filter((row) =>
    `${executionTitle(row)} ${operationLabels[row.operation_id] ?? row.operation_id}`
      .toLocaleLowerCase()
      .includes(filter.trim().toLocaleLowerCase()),
  );
  const groups = visible.reduce<{ label: string; rows: AiExecutionResponse[] }[]>((result, row) => {
    const label = dayGroup(row.created_at);
    const last = result.at(-1);
    if (last?.label === label) last.rows.push(row);
    else result.push({ label, rows: [row] });
    return result;
  }, []);
  const activeCount = history.filter((row) =>
    ['queued', 'running', 'waiting_input'].includes(statusOf(row)),
  ).length;
  return (
    <div className={fillStyles}>
      <PageHead
        eyebrow="AI CONSOLE"
        title="AI 控制台"
        description="查看自己的任务记录、执行进度和待确认事项。"
        action={
          <button
            type="button"
            className={cn(btnStyles, 'md:hidden')}
            aria-expanded={historyOpen}
            aria-controls="ai-history"
            onClick={() => setHistoryOpen(!historyOpen)}
          >
            <History size={14} />
            {historyOpen ? '返回任务' : '任务记录'}
          </button>
        }
      />
      <div className={workspaceStyles}>
        <aside
          id="ai-history"
          className={cn(sidebarStyles, historyOpen ? 'flex' : 'hidden md:flex')}
          aria-label="任务记录"
        >
          <div className="shrink-0 space-y-3 px-4 pt-5 pb-3">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 font-semibold">
                <History size={15} className="text-muted-ink" />
                任务记录
              </span>
              <span className="rounded-full bg-paper px-2 py-0.5 text-caption tabular-nums text-muted-ink ring-1 ring-inset ring-[color:var(--line)]">
                {history.length}
                {cursor ? '+' : ''}
              </span>
            </div>
            {canExecute && (
              <button
                type="button"
                className={cn(btnStyles, btnPrimaryStyles, 'w-full')}
                onClick={newTask}
              >
                <Plus size={15} />
                新建任务
              </button>
            )}
            <label className="relative">
              <span className="sr-only">筛选已加载的任务</span>
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted-ink">
                <Search size={14} />
              </span>
              <input
                type="search"
                className={cn(
                  controlStyles,
                  'h-[var(--control-height)] bg-paper/60 py-0 pl-9 text-caption',
                )}
                placeholder="筛选已加载的任务"
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
              />
            </label>
          </div>
          <div className={cn(scrollStyles, 'px-2 pb-3')}>
            {historyLoading ? (
              <div role="status" className="space-y-2 px-2.5 pt-3">
                <span className="sr-only">正在加载记录…</span>
                {[0, 1, 2].map((item) => (
                  <span
                    key={item}
                    aria-hidden="true"
                    className="flex gap-2.5 py-2 motion-safe:animate-[skeleton-pulse_1.6s_ease-in-out_infinite]"
                  >
                    <span className="size-8 shrink-0 rounded-lg bg-line/60" />
                    <span className="flex-1 space-y-2 pt-1">
                      <span className="block h-2.5 w-4/5 rounded-full bg-line/70" />
                      <span className="block h-2 w-1/2 rounded-full bg-line/50" />
                    </span>
                  </span>
                ))}
              </div>
            ) : visible.length ? (
              groups.map((group) => (
                <section key={group.label} aria-label={group.label}>
                  <h3 className={historyGroupStyles}>{group.label}</h3>
                  <ol className="space-y-0.5">
                    {group.rows.map((row) => {
                      const status = statusOf(row);
                      const title = executionTitle(row);
                      const label =
                        operationLabels[row.operation_id] ??
                        catalog?.operations.find((item) => item.id === row.operation_id)?.title ??
                        row.operation_id;
                      const Icon = operationMeta[row.operation_id]?.Icon ?? Bot;
                      return (
                        <li key={row.id}>
                          <button
                            type="button"
                            className={historyStyles}
                            aria-current={row.id === selected ? 'true' : undefined}
                            onClick={() => openExecution(row.id)}
                          >
                            <span
                              className={cn(
                                'relative mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg',
                                historyTones[status],
                              )}
                            >
                              <Icon size={15} />
                              {(status === 'running' || status === 'waiting_input') && (
                                <span
                                  aria-hidden="true"
                                  className={cn(
                                    'absolute -top-0.5 -right-0.5 size-2 rounded-full ring-2 ring-page motion-safe:animate-pulse',
                                    status === 'running' ? 'bg-brand' : 'bg-warning',
                                  )}
                                />
                              )}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="line-clamp-2 text-body font-medium leading-snug text-ink">
                                {title}
                              </span>
                              <span className="mt-1 flex min-w-0 items-center gap-1.5 text-caption text-muted-ink">
                                <ExecutionStatus compact status={status} />
                                {label !== title && (
                                  <>
                                    <span aria-hidden="true">·</span>
                                    <span className="truncate">{label}</span>
                                  </>
                                )}
                                <time
                                  className="ml-auto shrink-0 tabular-nums"
                                  dateTime={row.created_at}
                                >
                                  {timeLabel(row.created_at)}
                                </time>
                              </span>
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ol>
                </section>
              ))
            ) : (
              <div className="px-4 py-10 text-center text-muted-ink">
                <span className="mx-auto mb-3 grid size-11 place-items-center rounded-2xl bg-paper ring-1 ring-inset ring-[color:var(--line)]">
                  <Workflow size={20} className="opacity-70" />
                </span>
                <p className="font-medium text-ink">{filter ? '没有匹配的任务' : '暂无任务记录'}</p>
                <p className="mt-1 text-caption">
                  {filter
                    ? '试试其他关键词，或加载更早记录。'
                    : '你的问题、进展和成果将保存在这里。'}
                </p>
              </div>
            )}
            {cursor && (
              <button
                type="button"
                className="mt-3 w-full rounded-lg px-3 py-2.5 text-caption text-muted-ink hover:bg-paper hover:text-brand"
                disabled={loadingMore}
                onClick={() => {
                  void loadMore();
                }}
              >
                {loadingMore ? '正在加载…' : '加载更早记录'}
              </button>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2 border-t border-[color:var(--line)] px-4 py-3 text-caption text-muted-ink">
            {activeCount ? (
              <>
                <span
                  aria-hidden="true"
                  className="size-1.5 rounded-full bg-brand motion-safe:animate-pulse"
                />
                {activeCount} 个任务进行中
              </>
            ) : (
              '任务独立运行，历史自动保存'
            )}
          </div>
        </aside>
        <div className={cn(fillStyles, historyOpen && 'max-md:hidden')}>
          {(error || execution.error) && (
            <p
              role="alert"
              className="shrink-0 border-b border-[color:var(--line)] bg-danger-soft px-5 py-3 text-danger"
            >
              {error || execution.error}
            </p>
          )}
          {!selected && !canExecute && (
            <p role="status" className="m-auto p-6 text-center text-muted-ink">
              当前账号具有只读权限，可从任务记录或执行链接查看详情。
            </p>
          )}
          {!selected && catalog && canExecute && (
            <NewExecution key={draft} catalog={catalog} onCreated={openExecution} />
          )}
          {((!selected && canExecute && !catalog && !error) ||
            (selected && !currentView && !execution.error)) && (
            <div
              role="status"
              className="flex flex-1 flex-col items-center justify-center gap-4 text-muted-ink"
            >
              <span className="text-brand">
                <AgentSignal signal="working" glyph="work" />
              </span>
              正在加载工作区…
            </div>
          )}
          {selected && currentView && (
            <ExecutionPanel
              key={selected}
              view={currentView}
              canManage={
                me?.id === currentView.execution.owner_id &&
                canExecute &&
                !!catalog?.operations.some((item) => item.id === currentView.execution.operation_id)
              }
              connection={execution.connection}
              onRefresh={() => setRefresh((value) => value + 1)}
            />
          )}
        </div>
      </div>
    </div>
  );
}
