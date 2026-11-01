import { useEffect, useLayoutEffect, useMemo, useId, useRef, useState } from 'react';
import {
  aiCatalogResponseSchema,
  aiExecutionListResponseSchema,
  aiExecutionResponseSchema,
  type AiCatalogResponse,
  type AiExecutionResponse,
} from '@capability-hub/contracts';
import { api } from '../../shared/api/client.js';
import { useHub } from '../../shared/context/HubContext.js';
import { SelectField } from '../../shared/components/SelectField.js';
import {
  Workflow,
  ArrowRight,
  Minus,
  Plus,
  Maximize2,
  Minimize2,
} from '../../shared/icons/lucide.js';
import { btnStyles, btnPrimaryStyles, iconBtnStyles } from '../../shared/styles/recipes.js';
import { cn } from '../../shared/styles/cn.js';
import { ExecutionPanel } from './ExecutionPanel.js';
import { useAiExecution } from './use-ai-execution.js';
import { useAiCommand } from './use-ai-command.js';
import { activityItems } from './activity.js';
import { QuickReview, type ReviewOrigin } from './quick-review.js';
import { AgentBrief } from './AgentBrief.js';
import {
  acceptedSuggestion,
  pendingSuggestion,
  type AuditSuggestion,
} from './publication-suggestion.js';
import { agentDockStyles } from './styles.js';
import { statusLabels } from './presentation.js';

interface BusinessAgentPanelProps {
  versionId: string;
  feedbackId?: string;
  title: string;
  onCompleted?: () => void;
  onSuggestion?: (suggestion: AuditSuggestion | undefined) => void;
  onAdopt?: (origin: ReviewOrigin) => void;
  className?: string;
}

export function BusinessAgentPanel(props: BusinessAgentPanelProps) {
  const { me } = useHub();
  if (!me?.capabilities.can_ai) return null;
  return <BusinessWorkspace key={props.feedbackId ?? props.versionId} {...props} />;
}

function BusinessWorkspace({
  title,
  versionId,
  feedbackId,
  onCompleted,
  onSuggestion,
  onAdopt,
  className,
}: BusinessAgentPanelProps) {
  const { me, refresh: hubRefresh } = useHub();
  const [open, setOpen] = useState(false);
  const [wide, setWide] = useState(false);
  const [slot, setSlot] = useState<HTMLDivElement | null>(null);
  const panelId = useId();
  const toggle = useRef<HTMLButtonElement>(null);
  const minimize = useRef<HTMLButtonElement>(null);
  const previouslyOpen = useRef(false);
  useLayoutEffect(() => {
    if (open) minimize.current?.focus({ preventScroll: true });
    else if (previouslyOpen.current) toggle.current?.focus({ preventScroll: true });
    previouslyOpen.current = open;
  }, [open]);
  const completed = useRef(onCompleted);
  useEffect(() => {
    completed.current = onCompleted;
  }, [onCompleted]);
  const command = useAiCommand();
  const operation = feedbackId ? 'feedback-triage' : 'resource-audit';
  const [catalog, setCatalog] = useState<AiCatalogResponse>();
  const [profile, setProfile] = useState('');
  const [history, setHistory] = useState<AiExecutionResponse[]>([]);
  const [historyReady, setHistoryReady] = useState(false);
  const [selected, setSelected] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const execution = useAiExecution(selected, refresh);
  useEffect(() => {
    setHistoryReady(false);
    const controller = new AbortController();
    void (async () => {
      try {
        setError('');
        const config = aiCatalogResponseSchema.parse(
          await api('/api/ai/catalog', { signal: controller.signal }),
        );
        setCatalog(config);
        setProfile((value) =>
          config.profiles.some((item) => item.id === value) ? value : config.default_profile,
        );
        const params = new URLSearchParams({
          operation_id: operation,
          version_id: versionId,
          limit: '100',
          ...(feedbackId ? { feedback_id: feedbackId } : {}),
        });
        const items: AiExecutionResponse[] = [];
        let cursor: string | null = null;
        do {
          if (cursor) params.set('cursor', cursor);
          const page = aiExecutionListResponseSchema.parse(
            await api('/api/ai/executions?' + params.toString(), { signal: controller.signal }),
          );
          items.push(...page.items);
          cursor = page.next_cursor;
        } while (
          cursor &&
          (items.length < 30 ||
            (onSuggestion && !items.some((item) => item.status === 'succeeded')))
        );
        if (!controller.signal.aborted) {
          setHistory(items);
          setHistoryReady(true);
          setSelected((value) => value || items[0]?.id || '');
        }
      } catch (failure) {
        if (!controller.signal.aborted)
          setError(failure instanceof Error ? failure.message : '加载失败');
      }
    })();
    return () => controller.abort();
  }, [versionId, feedbackId, operation, refresh, hubRefresh, onSuggestion]);
  useEffect(() => {
    const latest = execution.view?.execution;
    if (latest) setHistory((items) => items.map((item) => (item.id === latest.id ? latest : item)));
    if (latest?.status === 'succeeded') completed.current?.();
  }, [execution.view?.execution.id, execution.view?.execution.status]);
  const view = execution.view?.execution.id === selected ? execution.view : undefined;
  const selectedRecord = view?.execution ?? history.find((item) => item.id === selected);
  const active = history.some((item) =>
    ['queued', 'running', 'waiting_input'].includes(
      item.id === selected ? (selectedRecord?.status ?? item.status) : item.status,
    ),
  );
  const startAvailable = historyReady && !!profile && !active;
  const start = async () => {
    if (busy || !startAvailable) return;
    setBusy(true);
    setError('');
    try {
      const result = aiExecutionResponseSchema.parse(
        await command('/api/ai/executions', {
          operation_id: operation,
          model_profile: profile,
          input: { version_id: versionId, ...(feedbackId ? { feedback_id: feedbackId } : {}) },
        }),
      );
      setHistory((items) => [result, ...items.filter((item) => item.id !== result.id)]);
      setSelected(result.id);
      setRefresh((value) => value + 1);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '发起失败');
    } finally {
      setBusy(false);
    }
  };
  const tools = view ? activityItems(view).filter((item) => item.kind === 'tool') : [];
  const accepted = useMemo(
    () => acceptedSuggestion(history.find((item) => item.status === 'succeeded')),
    [history],
  );
  const pending = useMemo(() => pendingSuggestion(view), [view]);
  useEffect(() => {
    onSuggestion?.(pending ?? accepted);
  }, [onSuggestion, pending, accepted]);
  const collapse = () => {
    setOpen(false);
  };
  return (
    <aside
      className={cn(agentDockStyles, className)}
      aria-label={feedbackId ? 'AI 反馈研判' : 'AI 资源审计'}
    >
      <QuickReview.Provider value={{ slot, onAdopt }}>
        <AgentBrief
          actionRef={setSlot}
          view={view}
          status={selectedRecord?.status}
          startAvailable={startAvailable}
          starting={busy}
          onStart={() => {
            toggle.current?.focus({ preventScroll: true });
            void start();
          }}
          title={feedbackId ? '反馈研判' : '资源审计'}
          emptyLabel={!catalog ? '正在连接' : !profile ? '尚未配置模型' : '尚未发起'}
          error={error || execution.error}
          open={open}
          toggleRef={toggle}
          panelId={panelId}
          onToggle={() => setOpen((value) => !value)}
        />
        <section
          id={panelId}
          hidden={!open}
          aria-label="Agent 实时工作区"
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.stopPropagation();
              collapse();
            }
          }}
          className={cn(
            'pointer-events-auto order-first flex h-[min(780px,calc(100dvh_-_112px))] lg:h-[min(780px,calc(100dvh_-_40px))] min-h-0 max-w-full w-[min(560px,calc(100vw_-_32px))] flex-col overflow-hidden rounded-2xl border border-brand/25 bg-paper shadow-overlay',
            wide && 'w-[min(800px,calc(100vw_-_32px))]',
            !open && 'hidden',
          )}
        >
          <header className="flex shrink-0 items-center gap-3 border-b border-[color:var(--line)] px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{title}</p>
              <p className="mt-1 text-caption text-muted-ink">
                {tools.length ? `已调用 ${tools.length} 次工具 · ` : ''}
                {execution.connection || '任务记录自动保存'}
              </p>
            </div>
            <button
              type="button"
              className={cn(iconBtnStyles, 'hidden @min-[561px]/dock:inline-flex')}
              aria-label={wide ? '恢复面板宽度' : '加宽 Agent 面板'}
              onClick={() => setWide((value) => !value)}
            >
              {wide ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>
            <button
              type="button"
              ref={minimize}
              className={iconBtnStyles}
              aria-label="最小化 Agent 面板"
              onClick={collapse}
            >
              <Minus size={18} />
            </button>
          </header>

          <details className="shrink-0 border-b border-separator bg-page/50">
            <summary className="cursor-pointer px-4 py-2 text-caption font-medium text-muted-ink">
              任务记录与模型设置
            </summary>
            <div className="flex flex-wrap items-center gap-2 px-4 pb-3">
              {history.length > 0 && (
                <div className="min-w-48 flex-1">
                  <SelectField
                    aria-label="研判任务记录"
                    value={selected}
                    onValueChange={setSelected}
                  >
                    {history.map((item) => (
                      <option key={item.id} value={item.id}>
                        {new Date(item.created_at).toLocaleString()} ·{' '}
                        {
                          statusLabels[
                            item.id === selected
                              ? (view?.execution.status ?? item.status)
                              : item.status
                          ]
                        }
                      </option>
                    ))}
                  </SelectField>
                </div>
              )}
              <div className="min-w-36 flex-1">
                <SelectField aria-label="研判模型" value={profile} onValueChange={setProfile}>
                  {catalog?.profiles.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </SelectField>
              </div>
              <button
                className={btnStyles}
                type="button"
                disabled={busy || !startAvailable}
                onClick={() => {
                  void start();
                }}
              >
                <Plus size={14} />
                {busy ? '正在排队…' : '发起新研判'}
              </button>
            </div>
          </details>
          {(error || execution.error) && (
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <p role="alert" className="text-danger">
                {error || execution.error}
              </p>
              <button
                type="button"
                className={btnStyles}
                onClick={() => setRefresh((value) => value + 1)}
              >
                重新连接
              </button>
            </div>
          )}
          {view ? (
            <ExecutionPanel
              compact
              visible={open}
              key={view.execution.id}
              view={view}
              canManage={view.execution.owner_id === me?.id}
              connection={execution.connection}
              onRefresh={() => setRefresh((value) => value + 1)}
            />
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-5 overflow-auto p-8 text-center">
              <span className="rounded-2xl bg-brand-soft p-5 text-brand">
                <Workflow size={24} />
              </span>
              <h3 className="text-section">{selected ? '正在恢复任务现场…' : '准备开始审计'}</h3>
              <p className="max-w-md leading-relaxed text-muted-ink">
                工具活动和分析会实时显示；你可以收起面板，继续填写发布申请。
              </p>
              {!catalog ? (
                <p role="status">正在加载模型配置…</p>
              ) : !catalog.profiles.length ? (
                <p>尚未配置 AI 模型，请联系管理员。</p>
              ) : (
                !selected && (
                  <button
                    type="button"
                    className={cn(btnStyles, btnPrimaryStyles)}
                    disabled={busy || !startAvailable}
                    onClick={() => {
                      void start();
                    }}
                  >
                    开始{feedbackId ? '反馈研判' : '资源审计'}
                    <ArrowRight size={15} />
                  </button>
                )
              )}
            </div>
          )}
        </section>
      </QuickReview.Provider>
    </aside>
  );
}
