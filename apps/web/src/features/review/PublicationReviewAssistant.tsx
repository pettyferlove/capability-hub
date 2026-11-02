import { useEffect, useState } from 'react';
import {
  aiExecutionListResponseSchema,
  aiExecutionResponseSchema,
  type AiExecutionResponse,
  type AiModelOptionsResponse,
} from '@capability-hub/contracts';
import type { ReviewResponse } from '@capability-hub/contracts/http';
import { api, ApiError } from '../../shared/api/client.js';
import { useQuery } from '../../shared/api/use-query.js';
import { useHub } from '../../shared/context/HubContext.js';
import { SelectField } from '../../shared/components/SelectField.js';
import { Overlay } from '../../shared/components/Overlay.js';
import { FileText, X } from '../../shared/icons/lucide.js';
import { AiText } from '../ai/AiText.js';
import { riskLabels } from '../ai/agent-brief.js';
import { reviewDecisionSheetHeaderStyles } from './styles.js';
import { btnStyles, iconBtnStyles } from '../../shared/styles/recipes.js';
import { ExecutionPanel } from '../ai/ExecutionPanel.js';
import { PublicationReviewReport } from '../ai/PublicationReviewReport.js';
import { jsonObject, statusLabels } from '../ai/presentation.js';
import { useAiCommand } from '../ai/use-ai-command.js';
import { useAiExecution } from '../ai/use-ai-execution.js';

/** 执行属于审核员本人；已处理的申请只加载历史简报。 */
export function PublicationReviewAssistant({
  request,
  onEvidence,
}: {
  request: Pick<ReviewResponse, 'id' | 'revision' | 'policy_digest' | 'can_decide'>;
  onEvidence: (path: string, start: number, end: number) => void;
}) {
  const { refresh: hubRefresh, reload } = useHub();
  const [refresh, setRefresh] = useState(0);
  const [history, setHistory] = useState<AiExecutionResponse[]>();
  const [selected, setSelected] = useState('');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const models = useQuery<AiModelOptionsResponse>(
    request.can_decide ? '/api/ai/model-options' : null,
    refresh + hubRefresh,
  );
  const command = useAiCommand();
  const execution = useAiExecution(selected, refresh + hubRefresh);
  const view = execution.view?.execution.id === selected ? execution.view : undefined;
  const contextChanged = view?.execution.error?.code === 'AI_CONFLICT';
  useEffect(() => {
    if (contextChanged && request.can_decide) reload();
  }, [contextChanged, request.can_decide, reload]);
  useEffect(() => {
    const controller = new AbortController();
    setError('');
    setHistory(undefined);
    void (async () => {
      try {
        const params = new URLSearchParams({
          operation_id: 'publication-review',
          publication_request_id: request.id,
          limit: '100',
        });
        const tasks: AiExecutionResponse[] = [];
        let cursor: string | null = null;
        do {
          if (cursor) params.set('cursor', cursor);
          const page = aiExecutionListResponseSchema.parse(
            await api('/api/ai/executions?' + params.toString(), { signal: controller.signal }),
          );
          tasks.push(...page.items);
          cursor = page.next_cursor;
        } while (cursor && tasks.length < 30);
        if (!controller.signal.aborted) {
          setHistory(tasks);
          setSelected((id) => (tasks.some((task) => task.id === id) ? id : (tasks[0]?.id ?? '')));
        }
      } catch (failure) {
        if (!controller.signal.aborted) {
          setSelected('');
          setError(failure instanceof Error ? failure.message : '简报记录加载失败');
        }
      }
    })();
    return () => controller.abort();
  }, [request.id, refresh, hubRefresh]);
  const running = history?.some((item) =>
    ['queued', 'running'].includes(
      item.id === selected ? (view?.execution.status ?? item.status) : item.status,
    ),
  );
  const start = async () => {
    if (busy || running || !request.can_decide) return;
    setBusy(true);
    setError('');
    try {
      const task = aiExecutionResponseSchema.parse(
        await command('/api/ai/executions', {
          operation_id: 'publication-review',
          input: { publication_request_id: request.id },
        }),
      );
      setSelected(task.id);
      setRefresh((value) => value + 1);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '生成简报失败');
      if (failure instanceof ApiError && [403, 409].includes(failure.status)) reload();
    } finally {
      setBusy(false);
    }
  };
  const result = view?.execution.result;
  const snapshot = jsonObject(jsonObject(result).snapshot);
  const historical =
    !request.can_decide ||
    (!!result &&
      (snapshot.request_revision !== request.revision ||
        snapshot.policy_digest !== request.policy_digest));
  const status = view?.execution.status ?? history?.find((task) => task.id === selected)?.status;
  const assessment = jsonObject(jsonObject(result).assessment);
  const risk = typeof assessment.risk === 'string' ? riskLabels[assessment.risk] : '';
  const problem = error || models.error || execution.error;
  const canStart =
    request.can_decide && !!history && !!models.data?.profiles.length && !running && !busy;
  const retry =
    canStart && !!status && ['failed', 'cancelled', 'timed_out'].includes(status) && !problem;
  const inspect = () => {
    reload();
    setOpen(true);
  };
  if (!request.can_decide && !selected && !problem) return null;
  return (
    <section aria-label="发布审核助手" className="flex flex-wrap items-center justify-end gap-2">
      {selected || problem ? (
        <>
          {retry && status ? (
            <button
              type="button"
              className="text-caption text-muted-ink underline"
              aria-haspopup="dialog"
              onClick={inspect}
            >
              上次{statusLabels[status]}
            </button>
          ) : (
            <span role="status" className="text-caption text-muted-ink">
              {historical
                ? '历史简报'
                : problem
                  ? '简报暂不可用'
                  : risk || (status ? statusLabels[status] : '')}
            </span>
          )}
          <button
            type="button"
            className={btnStyles}
            aria-haspopup={retry ? undefined : 'dialog'}
            onClick={
              retry
                ? () => {
                    void start();
                  }
                : inspect
            }
          >
            <FileText size={14} />
            {retry ? '重新生成简报' : result ? '查看审核简报' : '查看简报状态'}
          </button>
        </>
      ) : (
        <>
          <button
            type="button"
            className={btnStyles}
            disabled={!canStart}
            onClick={() => {
              void start();
            }}
          >
            <FileText size={14} />
            {busy ? '正在排队…' : '生成审核简报'}
          </button>
          {models.data && !models.data.profiles.length && <small>尚未配置模型</small>}
        </>
      )}
      <Overlay open={open} onClose={() => setOpen(false)} label="审核简报" variant="sheet">
        <div className={reviewDecisionSheetHeaderStyles}>
          <span>
            <FileText size={18} />
            审核简报
          </span>
          <button
            type="button"
            aria-label="关闭审核简报"
            className={iconBtnStyles}
            onClick={() => setOpen(false)}
          >
            <X size={18} />
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-caption text-muted-ink">
              {historical
                ? '历史简报仅供回看。'
                : '按这次申请的提交基线核对分发变化、资源声明和扫描告警。'}
            </p>
            {request.can_decide && (
              <button
                type="button"
                className={btnStyles}
                disabled={!canStart}
                onClick={() => {
                  void start();
                }}
              >
                重新生成
              </button>
            )}
          </div>
          {history && history.length > 1 && (
            <SelectField aria-label="审核简报记录" value={selected} onValueChange={setSelected}>
              {history.map((task) => (
                <option key={task.id} value={task.id}>
                  {new Date(task.created_at).toLocaleString()} ·{' '}
                  {statusLabels[task.id === selected && view ? view.execution.status : task.status]}
                </option>
              ))}
            </SelectField>
          )}
          {problem && (
            <p role="alert" className="text-danger">
              {problem}{' '}
              <button type="button" className={btnStyles} onClick={() => setRefresh((v) => v + 1)}>
                刷新
              </button>
            </p>
          )}
          {result ? (
            <>
              <div className="space-y-2 rounded-xl border border-separator bg-page p-4">
                <h3 className="font-semibold">本次审核摘要{risk && ' · ' + risk}</h3>
                {typeof assessment.summary === 'string' && <AiText text={assessment.summary} />}
              </div>
              {typeof assessment.suggested_resolution === 'string' && (
                <div className="space-y-2">
                  <h3 className="font-semibold">待核对事项</h3>
                  <AiText text={assessment.suggested_resolution} />
                </div>
              )}
              <details className="rounded-xl border border-separator p-4">
                <summary className="cursor-pointer font-medium text-brand">
                  展开分发对照、告警与文件依据
                </summary>
                <div className="mt-4">
                  <PublicationReviewReport
                    value={result}
                    onEvidence={(path, start, end) => {
                      setOpen(false);
                      onEvidence(path, start, end);
                    }}
                  />
                </div>
              </details>
            </>
          ) : view ? (
            <div className="flex h-[min(36rem,70dvh)] flex-col">
              <ExecutionPanel
                compact
                view={view}
                canManage={request.can_decide}
                connection={execution.connection}
                onRefresh={() => setRefresh((v) => v + 1)}
              />
            </div>
          ) : (
            !problem && <p role="status">正在读取简报记录…</p>
          )}
        </div>
      </Overlay>
    </section>
  );
}
