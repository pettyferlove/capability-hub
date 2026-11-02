import { useEffect, useRef, useState } from 'react';
import {
  aiExecutionListResponseSchema,
  aiExecutionResponseSchema,
  aiExecutionViewResponseSchema,
  type AiExecutionResponse,
  type AiModelOptionsResponse,
} from '@capability-hub/contracts';
import type { ReviewResponse } from '@capability-hub/contracts/http';
import { api, ApiError } from '../../shared/api/client.js';
import { useQuery } from '../../shared/api/use-query.js';
import { useHub } from '../../shared/context/HubContext.js';
import { ArrowRight, Check, FileText, RefreshCw, Search } from '../../shared/icons/lucide.js';
import { cn } from '../../shared/styles/cn.js';
import { iconBtnStyles, textBtnStyles } from '../../shared/styles/recipes.js';
import { AgentSignal } from '../ai/AgentSignal.js';
import { useAiCommand } from '../ai/use-ai-command.js';
import { useAiExecution } from '../ai/use-ai-execution.js';
import { jsonObject } from '../ai/presentation.js';
import { reviewBriefSignal } from './review-brief.js';

type Task = AiExecutionResponse;

const tones = {
  neutral: { color: 'text-muted-ink', mark: 'idle' },
  brand: { color: 'text-brand', mark: 'working' },
  warning: { color: 'text-warning', mark: 'caution' },
  danger: { color: 'text-danger', mark: 'caution' },
  success: { color: 'text-success', mark: 'complete' },
} as const;

const actionStyles = cn(
  textBtnStyles,
  'group/dock-action h-8 gap-1 rounded-md px-1.5 py-0 text-label leading-none hover:bg-brand-soft disabled:opacity-50',
);

const reviewPhases = [
  { id: 'investigate', label: '核对证据', Icon: Search },
  { id: 'assessment', label: '整理简报', Icon: FileText },
] as const;

function ReviewPhaseTrack({ phase }: { phase: (typeof reviewPhases)[number]['id'] }) {
  return (
    <div className="@container/review-track min-w-0 flex-1">
      <ol
        aria-label="审核研判阶段"
        className="mx-auto hidden max-w-60 grid-cols-2 gap-3 px-3 text-caption @min-[12rem]/review-track:grid"
      >
        {reviewPhases.map(({ id, label, Icon }) => {
          const current = id === phase;
          const complete = !current && id === 'investigate';
          const StageIcon = complete ? Check : Icon;
          return (
            <li
              key={id}
              aria-current={current ? 'step' : undefined}
              className="flex flex-col gap-1.5 text-muted-ink aria-[current=step]:font-medium aria-[current=step]:text-brand"
            >
              <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                <StageIcon size={13} />
                {label}
              </span>
              <span
                aria-hidden="true"
                className={cn(
                  'relative h-0.5 overflow-hidden rounded-full bg-line',
                  current && 'bg-brand/20',
                  complete && 'bg-brand/60',
                )}
              >
                {current && (
                  <span className="absolute inset-y-0 left-0 w-1/2 rounded-full bg-brand motion-safe:animate-[agent-sweep_2s_ease-in-out_infinite] motion-reduce:w-full" />
                )}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function active(task: Task | null | undefined) {
  return !!task && ['queued', 'running', 'waiting_input'].includes(task.status);
}

async function loadTask(requestId: string, ownerId: string, signal: AbortSignal) {
  const params = new URLSearchParams({
    operation_id: 'publication-review',
    publication_request_id: requestId,
    limit: '100',
  });
  let latest: Task | undefined;
  let cursor: string | null = null;
  let found = 0;
  do {
    if (cursor) params.set('cursor', cursor);
    const page = aiExecutionListResponseSchema.parse(
      await api('/api/ai/executions?' + params.toString(), { signal }),
    );
    const relevant = page.items.filter(
      (item) =>
        item.owner_id === ownerId &&
        item.operation_id === 'publication-review' &&
        jsonObject(item.input).publication_request_id === requestId,
    );
    const running = relevant.find(active);
    if (running) return running;
    latest ??= relevant[0];
    found += relevant.length;
    cursor = page.next_cursor;
  } while (cursor && found < 30);
  return latest ?? null;
}

/** 底栏只汇总当前申请的研判，正式审核决定由独立的人工操作提交。 */
export function PublicationReviewAssistant({
  request,
  onEvidence,
}: {
  request: Pick<ReviewResponse, 'id' | 'revision' | 'policy_digest' | 'can_decide'>;
  onEvidence: (path: string, start: number, end: number) => void;
}) {
  const { me, refresh: hubRefresh, reload } = useHub();
  const [refresh, setRefresh] = useState(0);
  const [record, setRecord] = useState<Task | null>();
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const lookup = useRef<AbortController | null>(null);
  const command = useAiCommand();
  const owner = me?.id;
  const models = useQuery<AiModelOptionsResponse>(
    request.can_decide ? '/api/ai/model-options' : null,
    refresh + hubRefresh,
  );
  useEffect(() => {
    const controller = new AbortController();
    lookup.current = controller;
    setRecord(undefined);
    setLoadError('');
    if (owner)
      void loadTask(request.id, owner, controller.signal)
        .then((task) => {
          if (!controller.signal.aborted) setRecord(task);
        })
        .catch((failure: unknown) => {
          if (!controller.signal.aborted)
            setLoadError(failure instanceof Error ? failure.message : '研判状态读取失败');
        });
    return () => controller.abort();
  }, [owner, request.id, hubRefresh, refresh]);
  const streamId = record && active(record) ? record.id : '';
  const execution = useAiExecution(streamId, refresh + hubRefresh);
  const view = execution.view?.execution.id === streamId ? execution.view : undefined;
  const readError = loadError || (streamId && execution.error);
  const task = readError ? undefined : (view?.execution ?? record);
  const refreshedConflict = useRef('');
  useEffect(() => {
    if (
      request.can_decide &&
      task?.error?.code === 'AI_CONFLICT' &&
      refreshedConflict.current !== task.id
    ) {
      refreshedConflict.current = task.id;
      reload();
    }
  }, [task, request.can_decide, reload]);
  const running = active(task);
  const canStart =
    request.can_decide &&
    record !== undefined &&
    !!models.data?.profiles.length &&
    !running &&
    !readError;
  const refreshStatus = () => {
    setError('');
    setRefresh((n) => n + 1);
  };
  const update = async () => {
    if (busy || !request.can_decide || (!running && !canStart)) return;
    setBusy(true);
    setError('');
    try {
      let next: Task;
      if (running && task) {
        const path = '/api/ai/executions/' + encodeURIComponent(task.id);
        const latest = aiExecutionViewResponseSchema.parse(await api(path)).execution;
        next = active(latest)
          ? aiExecutionResponseSchema.parse(await command(path + '/cancel', {}, latest.revision))
          : latest;
      } else {
        next = aiExecutionResponseSchema.parse(
          await command('/api/ai/executions', {
            operation_id: 'publication-review',
            input: { publication_request_id: request.id },
          }),
        );
      }
      lookup.current?.abort();
      setLoadError('');
      setRecord(next);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '研判操作失败');
      if (failure instanceof ApiError && [403, 404, 409, 412].includes(failure.status)) reload();
    } finally {
      setBusy(false);
    }
  };
  if (!request.can_decide && !task && !readError) return null;
  const signal = reviewBriefSignal(request, task, view);
  const needsRefresh = !!readError || (!!models.error && !running);
  const noModel = request.can_decide && !!models.data && !models.data.profiles.length;
  const hint = readError
    ? '研判状态暂不可用，请刷新状态。'
    : error ||
      (execution.connection.includes('重试') && running ? '正在重新连接研判进度。' : '') ||
      (!task && (models.error || (noModel && '尚未配置模型，可继续人工审核。'))) ||
      signal.text;
  const label = readError ? '状态待刷新' : signal.label;
  const tone = tones[readError ? 'warning' : signal.tone];
  const source = signal.evidence;
  const rerun = task?.status === 'succeeded';
  const action = running ? '取消研判' : rerun ? '重新研判' : task ? '重试研判' : '生成审核简报';
  return (
    <section
      aria-label="发布审核助手"
      className={cn(
        'flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5',
        request.can_decide
          ? 'flex-[1_1_21rem]'
          : 'rounded-xl border border-separator bg-paper px-4 py-2.5',
      )}
    >
      <div className="flex min-w-0 flex-[1_1_13rem] items-center">
        <span aria-hidden="true" className={cn('mr-2.5 shrink-0', tone.color)}>
          <AgentSignal
            signal={request.can_decide && task?.status === 'waiting_input' ? 'waiting' : tone.mark}
            glyph={signal.phase === 'assessment' ? 'report' : signal.phase ? 'search' : 'think'}
            risk={signal.tone === 'danger' ? 'high' : undefined}
          />
        </span>
        <div role="status" aria-atomic="true" className="min-w-0 space-y-0.5">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <strong className="text-body font-semibold leading-5 text-ink">发布审核助手</strong>
            <span
              className={cn(
                'whitespace-nowrap rounded-full bg-current/8 px-2 py-0.5 text-caption font-medium leading-4',
                tone.color,
              )}
            >
              {label}
            </span>
          </div>
          <p
            key={hint}
            title={hint}
            className="line-clamp-2 break-words text-caption leading-4 text-muted-ink motion-safe:animate-[popover-in_220ms_ease-out_both]"
          >
            {hint}
          </p>
        </div>
        {signal.phase && <ReviewPhaseTrack phase={signal.phase} />}
      </div>
      {(request.can_decide || needsRefresh) && (
        <div className="ml-auto flex max-w-full flex-wrap items-center justify-end gap-x-1">
          {source && (
            <button
              type="button"
              className={actionStyles}
              onClick={() => onEvidence(source.path, source.start, source.end)}
            >
              核对依据
              <ArrowRight
                size={13}
                className="motion-safe:transition-transform motion-safe:group-hover/dock-action:translate-x-0.5"
              />
            </button>
          )}
          {needsRefresh ? (
            <button type="button" className={actionStyles} onClick={refreshStatus}>
              <RefreshCw size={13} />
              刷新状态
            </button>
          ) : (
            request.can_decide && (
              <button
                type="button"
                aria-label={action}
                title={noModel && !running ? '尚未配置模型' : action}
                className={
                  rerun
                    ? cn(iconBtnStyles, 'group/dock-action size-8')
                    : cn(actionStyles, running && 'text-muted-ink hover:text-brand')
                }
                disabled={busy || (!running && !canStart)}
                onClick={() => {
                  void update();
                }}
              >
                {rerun ? (
                  <RefreshCw
                    size={15}
                    className={
                      busy
                        ? 'motion-safe:animate-spin'
                        : 'motion-safe:transition-transform motion-safe:group-hover/dock-action:rotate-45'
                    }
                  />
                ) : busy ? (
                  '正在处理…'
                ) : (
                  action
                )}
              </button>
            )
          )}
        </div>
      )}
    </section>
  );
}
