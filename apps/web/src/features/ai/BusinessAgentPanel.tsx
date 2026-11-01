import { useEffect, useId, useRef, useState } from 'react';
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
import { agentDockStyles, agentDockToggleStyles } from './styles.js';
import { statusLabels, toolLabels } from './presentation.js';

export function BusinessAgentPanel({
  versionId,
  feedbackId,
  title,
  onCompleted,
}: {
  versionId: string;
  feedbackId?: string;
  title: string;
  onCompleted?: () => void;
}) {
  const { me } = useHub();
  if (!me?.capabilities.can_ai) return null;
  return (
    <BusinessWorkspace
      key={feedbackId ?? versionId}
      versionId={versionId}
      feedbackId={feedbackId}
      title={title}
      onCompleted={onCompleted}
    />
  );
}

function BusinessWorkspace({
  title,
  versionId,
  feedbackId,
  onCompleted,
}: {
  versionId: string;
  feedbackId?: string;
  onCompleted?: () => void;
  title: string;
}) {
  const { me, refresh: hubRefresh } = useHub();
  const [open, setOpen] = useState(false);
  const [wide, setWide] = useState(false);
  const panelId = useId();
  const toggle = useRef<HTMLButtonElement>(null);
  const completed = useRef(onCompleted);
  useEffect(() => {
    completed.current = onCompleted;
  }, [onCompleted]);
  const command = useAiCommand();
  const operation = feedbackId ? 'feedback-triage' : 'resource-audit';
  const [catalog, setCatalog] = useState<AiCatalogResponse>();
  const [profile, setProfile] = useState('');
  const [history, setHistory] = useState<AiExecutionResponse[]>([]);
  const [selected, setSelected] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const execution = useAiExecution(selected, refresh);
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        setError('');
        const config = aiCatalogResponseSchema.parse(
          await api('/api/ai/catalog', { signal: controller.signal }),
        );
        setCatalog(config);
        setProfile((value) => value || config.default_profile);
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
        } while (cursor && items.length < 30);
        if (!controller.signal.aborted) {
          setHistory(items);
          setSelected((value) => value || items[0]?.id || '');
        }
      } catch (failure) {
        if (!controller.signal.aborted)
          setError(failure instanceof Error ? failure.message : '加载失败');
      }
    })();
    return () => controller.abort();
  }, [versionId, feedbackId, operation, refresh, hubRefresh]);
  useEffect(() => {
    const latest = execution.view?.execution;
    if (latest)
      setHistory((items) =>
        items.map((item) => (item.id === latest.id ? { ...item, status: latest.status } : item)),
      );
    if (latest?.status === 'succeeded') completed.current?.();
  }, [execution.view?.execution.id, execution.view?.execution.status]);
  const start = async () => {
    if (busy) return;
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
      setSelected(result.id);
      setRefresh((value) => value + 1);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '发起失败');
    } finally {
      setBusy(false);
    }
  };
  const active = history.some((item) =>
    ['queued', 'running', 'waiting_input'].includes(
      item.id === selected ? (execution.view?.execution.status ?? item.status) : item.status,
    ),
  );
  const current = execution.view?.execution;
  const status = current?.status ?? history.find((item) => item.id === selected)?.status;
  const tools = execution.view
    ? activityItems(execution.view).filter((item) => item.kind === 'tool')
    : [];
  const latestTool = tools.at(-1);
  const statusText =
    error || execution.error
      ? '连接异常'
      : status
        ? statusLabels[status]
        : !catalog
          ? '正在连接'
          : !profile
            ? '尚未配置模型'
            : '尚未发起';
  const latestText =
    status === 'waiting_input'
      ? '报告已生成，等待你的确认'
      : (current?.error?.message ??
        (latestTool
          ? `${toolLabels[latestTool.name] ?? latestTool.name} · ${latestTool.display ?? (latestTool.state === 'running' ? '进行中' : '已结束')}`
          : current?.message_blocks.at(-1)?.text || '从入口文件开始，按需检查资源证据'));
  const collapse = () => {
    setOpen(false);
    toggle.current?.focus();
  };
  return (
    <aside className={agentDockStyles} aria-label={feedbackId ? 'AI 反馈研判' : 'AI 资源审计'}>
      <button
        ref={toggle}
        type="button"
        className={agentDockToggleStyles}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={open ? '收起 Agent 实时状态' : '展开 Agent 实时状态'}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand">
          <Workflow
            size={18}
            className={status === 'running' ? 'motion-safe:animate-pulse' : undefined}
          />
        </span>
        <span className="min-w-0 flex-1 text-left">
          <span className="flex items-center gap-2 font-semibold">
            Agent · {feedbackId ? '反馈研判' : '资源审计'}
            <span
              role="status"
              className={cn(
                'text-caption',
                status === 'waiting_input' ? 'text-warning' : 'text-brand',
              )}
            >
              {statusText}
            </span>
          </span>
          <span className="mt-0.5 block truncate text-caption font-normal text-muted-ink">
            {latestText}
          </span>
        </span>
        {open ? <Minus size={16} /> : <ArrowRight size={16} />}
      </button>
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
          'order-first flex h-[min(680px,calc(100dvh_-_112px))] min-h-0 w-[min(560px,calc(100vw_-_32px))] flex-col overflow-hidden rounded-2xl border border-brand/25 bg-paper shadow-overlay',
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
            className={iconBtnStyles}
            aria-label={wide ? '恢复面板宽度' : '加宽 Agent 面板'}
            onClick={() => setWide((value) => !value)}
          >
            {wide ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
          <button
            type="button"
            className={iconBtnStyles}
            aria-label="最小化 Agent 面板"
            onClick={collapse}
          >
            <Minus size={18} />
          </button>
        </header>

        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[color:var(--line)] bg-page/50 px-4 py-2">
          {history.length > 0 && (
            <div className="min-w-48 flex-1">
              <SelectField aria-label="研判任务记录" value={selected} onValueChange={setSelected}>
                {history.map((item) => (
                  <option key={item.id} value={item.id}>
                    {new Date(item.created_at).toLocaleString()} ·{' '}
                    {
                      statusLabels[
                        item.id === selected
                          ? (execution.view?.execution.status ?? item.status)
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
            disabled={busy || !profile || active}
            onClick={() => {
              void start();
            }}
          >
            <Plus size={14} />
            {busy ? '正在排队…' : '发起新研判'}
          </button>
        </div>
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
        {execution.view ? (
          <ExecutionPanel
            compact
            visible={open}
            key={execution.view.execution.id}
            view={execution.view}
            canManage={execution.view.execution.owner_id === me?.id}
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
                  disabled={busy}
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
    </aside>
  );
}
