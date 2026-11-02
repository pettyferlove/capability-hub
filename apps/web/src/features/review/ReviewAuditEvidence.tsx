import { useEffect, useState } from 'react';
import {
  aiExecutionListResponseSchema,
  aiExecutionResponseSchema,
  type AiExecutionResponse,
  type AiModelOptionsResponse,
} from '@capability-hub/contracts';
import type { ReviewResponse } from '@capability-hub/contracts/http';
import { api } from '../../shared/api/client.js';
import { useQuery } from '../../shared/api/use-query.js';
import { useHub } from '../../shared/context/HubContext.js';
import { LoaderCircle, RefreshCw } from '../../shared/icons/lucide.js';
import { cn } from '../../shared/styles/cn.js';
import { btnStyles, textBtnStyles } from '../../shared/styles/recipes.js';
import { BusinessAssessment } from '../ai/BusinessAssessment.js';
import { riskLabels } from '../ai/agent-brief.js';
import { jsonObject, statusLabels, type Json } from '../ai/presentation.js';
import { useAiCommand } from '../ai/use-ai-command.js';
import { useAiExecution } from '../ai/use-ai-execution.js';

type AuditTarget = Pick<ReviewResponse, 'version_id' | 'content_digest'>;

/** 已完成采纳的审计回执，用于识别同一建议及其完成时间。 */
export type ReviewAuditAdvice = { executionId: string; acceptedAt: string; text: string };

function sameContent(value: Json | undefined, target: AuditTarget) {
  const report = jsonObject(value);
  return report.version_id === target.version_id && report.content_digest === target.content_digest;
}

function acceptedAdvice(
  task: AiExecutionResponse | undefined,
  target: AuditTarget,
  owner?: string,
) {
  if (
    !task ||
    task.owner_id !== owner ||
    task.operation_id !== 'resource-audit' ||
    task.status !== 'succeeded' ||
    jsonObject(task.input).version_id !== target.version_id ||
    !sameContent(task.result, target)
  )
    return;
  const report = jsonObject(task.result);
  const suggestion = jsonObject(report.assessment).suggested_resolution;
  if (report.approved === true && typeof suggestion === 'string' && suggestion.trim())
    return { executionId: task.id, acceptedAt: task.updated_at, text: suggestion.trim() };
}

async function latestAudit(versionId: string, owner: string, signal: AbortSignal) {
  const params = new URLSearchParams({
    operation_id: 'resource-audit',
    version_id: versionId,
    limit: '100',
  });
  let cursor: string | null = null;
  do {
    if (cursor) params.set('cursor', cursor);
    const page = aiExecutionListResponseSchema.parse(
      await api('/api/ai/executions?' + params.toString(), { signal }),
    );
    const task = page.items.find(
      (item) =>
        item.owner_id === owner &&
        item.operation_id === 'resource-audit' &&
        jsonObject(item.input).version_id === versionId,
    );
    if (task) return task;
    cursor = page.next_cursor;
  } while (cursor);
  return null;
}

/** 版本审计只提供内容依据。人工采纳完成后，审核意见草稿按本人的报告和固定内容摘要取值。 */
export function ReviewAuditEvidence({
  request,
  onAdvice,
  onEvidence,
}: {
  request: AuditTarget;
  onAdvice: (advice: ReviewAuditAdvice) => void;
  onEvidence: (path: string, start: number, end: number) => void;
}) {
  const { me, refresh: hubRefresh } = useHub();
  const ownerId = me?.id;
  const { version_id: versionId, content_digest: digest } = request;
  const [refresh, setRefresh] = useState(0);
  const [record, setRecord] = useState<AiExecutionResponse | null>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [responded, setResponded] = useState('');
  const command = useAiCommand();
  const models = useQuery<AiModelOptionsResponse>('/api/ai/model-options', refresh + hubRefresh);
  const latest =
    record && record.owner_id === ownerId && jsonObject(record.input).version_id === versionId
      ? record
      : undefined;
  const execution = useAiExecution(latest?.id ?? '', refresh + hubRefresh);
  const view = latest && execution.view?.execution.id === latest.id ? execution.view : undefined;
  const task = !execution.error ? (view?.execution ?? latest) : undefined;
  const active = !!task && ['queued', 'running', 'waiting_input'].includes(task.status);
  const pending =
    task?.status === 'waiting_input'
      ? view?.interactions.find((item) => item.status === 'pending')
      : undefined;
  const rawReport =
    task?.result ??
    jsonObject(pending?.request).assessment ??
    view?.artifacts.find((item) => item.name === 'assessment')?.content;
  const report = sameContent(rawReport, request) ? rawReport : undefined;
  const assessment = jsonObject(jsonObject(report).assessment);
  const suggestion =
    typeof assessment.suggested_resolution === 'string' ? assessment.suggested_resolution : '';
  useEffect(() => {
    const controller = new AbortController();
    setError('');
    if (ownerId) {
      void latestAudit(versionId, ownerId, controller.signal)
        .then((data) => {
          if (!controller.signal.aborted) setRecord(data);
        })
        .catch((failure: unknown) => {
          if (!controller.signal.aborted) {
            setRecord(undefined);
            setError(failure instanceof Error ? failure.message : '审计记录加载失败');
          }
        });
    }
    return () => controller.abort();
  }, [ownerId, versionId, digest, refresh, hubRefresh]);
  const advice = acceptedAdvice(task, request, ownerId);
  const adviceId = advice?.executionId;
  const acceptedAt = advice?.acceptedAt;
  const adviceText = advice?.text;
  useEffect(() => {
    if (adviceId && adviceText && acceptedAt && !execution.error)
      onAdvice({ executionId: adviceId, text: adviceText, acceptedAt });
  }, [adviceId, adviceText, acceptedAt, execution.error, onAdvice]);

  const start = async () => {
    if (busy || active || record === undefined || !models.data?.profiles.length) return;
    setBusy(true);
    setError('');
    try {
      const latest = aiExecutionResponseSchema.parse(
        await command('/api/ai/executions', {
          operation_id: 'resource-audit',
          input: { version_id: versionId },
        }),
      );
      setRecord(latest);
      setResponded('');
      setRefresh((value) => value + 1);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '发起审计失败');
    } finally {
      setBusy(false);
    }
  };
  const respond = async (approved: boolean) => {
    if (!pending || !task || !report || busy || responded === pending.id) return;
    setBusy(true);
    setError('');
    try {
      await command(
        `/api/ai/executions/${task.id}/interactions/${pending.id}/respond`,
        { response: { approved, comment: '', apply_feedback: false } },
        pending.revision,
      );
      setResponded(pending.id);
      setRefresh((value) => value + 1);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '记录采纳决定失败');
    } finally {
      setBusy(false);
    }
  };
  const adopted = jsonObject(report).approved;
  const stateLabel =
    adopted === true
      ? '已采纳'
      : adopted === false
        ? '未采纳'
        : task
          ? statusLabels[task.status]
          : record !== undefined
            ? '尚无报告'
            : '正在读取';
  return (
    <section
      aria-label="版本资源审计"
      className="mb-3 min-w-0 rounded-xl border border-separator bg-page px-4 py-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <h4 className="inline-flex min-h-7 items-center text-label font-semibold leading-none">
          版本资源审计
        </h4>
        <div className="ml-auto flex flex-wrap items-center justify-end gap-x-2 gap-y-1">
          <span
            role="status"
            className="inline-flex h-7 items-center gap-1.5 whitespace-nowrap text-label leading-none text-muted-ink"
          >
            {active && task?.status !== 'waiting_input' ? (
              <LoaderCircle
                aria-hidden="true"
                size={12}
                className="text-brand motion-safe:animate-spin"
              />
            ) : (
              <i
                aria-hidden="true"
                className={cn(
                  'size-1.5 rounded-full',
                  adopted === true ? 'bg-success' : pending ? 'bg-warning' : 'bg-muted-ink/55',
                )}
              />
            )}
            <span key={stateLabel} className="motion-safe:animate-[popover-in_220ms_ease-out_both]">
              {stateLabel}
              {typeof assessment.risk === 'string' &&
                ' · ' + (riskLabels[assessment.risk] ?? '证据有限')}
            </span>
          </span>
          {!active && (
            <button
              type="button"
              className="group/audit-retry inline-flex h-7 items-center justify-center gap-1 rounded-md border border-separator bg-paper px-2 text-label font-medium leading-none whitespace-nowrap text-brand hover:border-brand/40 hover:bg-brand-soft disabled:opacity-50"
              disabled={busy || record === undefined || !models.data?.profiles.length}
              onClick={() => {
                void start();
              }}
            >
              <RefreshCw
                aria-hidden="true"
                size={12}
                className={
                  busy
                    ? 'motion-safe:animate-spin'
                    : 'motion-safe:transition-transform motion-safe:group-hover/audit-retry:rotate-45'
                }
              />
              {task ? '重新审计' : '发起审计'}
            </button>
          )}
        </div>
      </div>
      {!task && (
        <p className="mt-2 text-caption text-muted-ink">
          {models.data && !models.data.profiles.length
            ? '尚未配置 AI 模型，可继续人工审核。'
            : '核对这个版本的文件与扫描发现，作为填写审核意见的参考。'}
        </p>
      )}
      {task?.result && !report && (
        <p className="mt-2 text-caption text-muted-ink">这份报告与候选内容不匹配，请重新审计。</p>
      )}
      {active && !pending && (
        <p role="status" className="mt-2 text-caption text-muted-ink">
          {responded
            ? '正在保存审计结果…'
            : task?.status === 'queued'
              ? '审计已排队，可继续填写审核意见。'
              : '正在核对版本内容，可继续填写审核意见。'}
        </p>
      )}
      {pending && report && (
        <div className="mt-3 space-y-2">
          <p className="whitespace-pre-wrap break-words">{suggestion}</p>
          <p className="text-caption text-muted-ink">
            采纳后，建议会带入空白审核意见；已有文字时由你决定是否追加。
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={btnStyles}
              disabled={busy || responded === pending.id}
              onClick={() => {
                void respond(true);
              }}
            >
              采纳审计建议
            </button>
            <button
              type="button"
              className={textBtnStyles}
              disabled={busy || responded === pending.id}
              onClick={() => {
                void respond(false);
              }}
            >
              暂不采纳
            </button>
          </div>
          {responded === pending.id && <p role="status">正在保存审计结果…</p>}
        </div>
      )}
      {report && (
        <details className="mt-2 text-caption">
          <summary className="cursor-pointer text-brand">查看审计发现与文件依据</summary>
          <div className="mt-3 text-body">
            <BusinessAssessment value={report} onEvidence={onEvidence} review />
          </div>
        </details>
      )}
      {(error || models.error || execution.error || task?.error) && (
        <p role="alert" className="mt-2 text-caption text-danger">
          {error || models.error || execution.error || task?.error?.message}{' '}
          <button type="button" className={textBtnStyles} onClick={() => setRefresh((v) => v + 1)}>
            刷新
          </button>
        </p>
      )}
    </section>
  );
}
