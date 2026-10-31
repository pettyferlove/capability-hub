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
import { History, LoaderCircle, Plus, Search, Workflow } from '../../shared/icons/lucide.js';
import { navigate } from '../../shared/navigation/history-navigation.js';
import { btnStyles, btnPrimaryStyles } from '../../shared/styles/recipes.js';
import { cn } from '../../shared/styles/cn.js';
import { ExecutionPanel } from './ExecutionPanel.js';
import { ExecutionStatus } from './ExecutionStatus.js';
import { NewExecution } from './NewExecution.js';
import { executionTitle, operationLabels } from './presentation.js';
import { useAiExecution } from './use-ai-execution.js';
import {
  controlStyles,
  fillStyles,
  historyStyles,
  scrollStyles,
  sidebarStyles,
  workspaceStyles,
} from './styles.js';

export default function AiLabPage({ query }: { query: string }) {
  const { me } = useHub();
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
    const controller = new AbortController();
    void api('/api/ai/catalog', { signal: controller.signal })
      .then((data) => setCatalog(aiCatalogResponseSchema.parse(data)))
      .catch((failure: unknown) => {
        if (!controller.signal.aborted)
          setError(failure instanceof Error ? failure.message : '加载失败');
      });
    return () => controller.abort();
  }, []);
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
  const visible = history.filter((row) =>
    `${executionTitle(row)} ${operationLabels[row.operation_id] ?? row.operation_id}`
      .toLocaleLowerCase()
      .includes(filter.trim().toLocaleLowerCase()),
  );
  return (
    <div className={fillStyles}>
      <PageHead
        eyebrow="EXPLORE, COLLABORATE, DECIDE"
        title="AI 工作台"
        description="体验 Agent 的实时输出、工具调用与多角色协作，参与关键决策。"
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
      {!me?.capabilities.can_ai && (
        <p role="alert" className="mb-3 text-danger">
          当前账号没有 AI 执行权限。
        </p>
      )}
      <div className={workspaceStyles}>
        <aside
          id="ai-history"
          className={cn(sidebarStyles, historyOpen ? 'flex' : 'hidden md:flex')}
          aria-label="任务记录"
        >
          <div className="shrink-0 space-y-4 px-4 pt-5 pb-3">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 font-semibold">
                <History size={15} className="text-muted-ink" />
                任务记录
              </span>
              <span className="text-caption tabular-nums text-muted-ink">
                {history.length}
                {cursor ? '+' : ''}
              </span>
            </div>
            <button
              type="button"
              className={cn(btnStyles, btnPrimaryStyles, 'w-full')}
              onClick={newTask}
            >
              <Plus size={15} />
              新建任务
            </button>
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
              <p role="status" className="p-4 text-muted-ink">
                正在加载记录…
              </p>
            ) : visible.length ? (
              <ol className="space-y-1">
                {visible.map((row) => (
                  <li key={row.id}>
                    <button
                      type="button"
                      className={historyStyles}
                      aria-current={row.id === selected ? 'true' : undefined}
                      onClick={() => openExecution(row.id)}
                    >
                      <span className="line-clamp-2 text-body font-medium leading-relaxed text-ink">
                        {executionTitle(row)}
                      </span>
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate text-caption text-muted-ink">
                          {operationLabels[row.operation_id] ??
                            catalog?.operations.find((item) => item.id === row.operation_id)
                              ?.title ??
                            row.operation_id}
                        </span>
                        <time
                          className="shrink-0 text-caption tabular-nums text-muted-ink"
                          dateTime={row.created_at}
                        >
                          {new Date(row.created_at).toLocaleDateString(undefined, {
                            month: '2-digit',
                            day: '2-digit',
                          })}
                        </time>
                      </span>
                      <span className="flex">
                        <ExecutionStatus
                          status={
                            row.id === selected && currentView
                              ? currentView.execution.status
                              : row.status
                          }
                        />
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
            ) : (
              <div className="px-4 py-8 text-center text-muted-ink">
                <Workflow size={24} className="mx-auto mb-3 opacity-60" />
                <p>{filter ? '没有匹配的任务' : '从第一个任务开始'}</p>
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
          <div className="shrink-0 border-t border-[color:var(--line)] px-4 py-3 text-caption text-muted-ink">
            任务独立运行，历史自动保存
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
          {!selected && catalog && (
            <NewExecution
              key={draft}
              catalog={catalog}
              canExecute={!!me?.capabilities.can_ai}
              onCreated={openExecution}
            />
          )}
          {((!selected && !catalog && !error) ||
            (selected && !currentView && !execution.error)) && (
            <div
              role="status"
              className="flex flex-1 items-center justify-center gap-3 text-muted-ink"
            >
              <LoaderCircle size={20} className="text-brand motion-safe:animate-spin" />
              正在加载工作区…
            </div>
          )}
          {selected && currentView && (
            <ExecutionPanel
              key={selected}
              view={currentView}
              canManage={me?.id === currentView.execution.owner_id && !!me.capabilities.can_ai}
              connection={execution.connection}
              onRefresh={() => setRefresh((value) => value + 1)}
            />
          )}
        </div>
      </div>
    </div>
  );
}
