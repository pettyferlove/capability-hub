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
import { Check, ChevronDown, FileText, RefreshCw } from '../../shared/icons/lucide.js';
import { cn } from '../../shared/styles/cn.js';
import { btnPrimaryStyles, btnStyles, textBtnStyles } from '../../shared/styles/recipes.js';
import { BusinessAssessment } from '../ai/BusinessAssessment.js';
import { jsonObject, type Json } from '../ai/presentation.js';
import { useAiCommand } from '../ai/use-ai-command.js';
import { useAiExecution } from '../ai/use-ai-execution.js';
import { ReviewAuditActivity } from './ReviewAuditActivity.js';

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
  const view =
    !execution.error && latest && execution.view?.execution.id === latest.id
      ? execution.view
      : undefined;
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
  return (
    <section
      aria-label="版本资源审计"
      className="mb-3 min-w-0 overflow-hidden rounded-2xl border border-separator bg-paper"
    >
      <ReviewAuditActivity
        status={task?.status}
        view={view}
        report={report}
        saving={Boolean(responded)}
        emptyLabel={
          error || execution.error ? '状态不可用' : record === undefined ? '正在读取' : '尚无报告'
        }
        emptyHint={
          models.data && !models.data.profiles.length
            ? '尚未配置 AI 模型，可继续人工审核。'
            : '核对版本文件和扫描发现，为填写审核意见提供依据。'
        }
      >
        {!active && (
          <button
            type="button"
            className="group/audit-retry inline-flex min-h-8 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-separator bg-paper px-2.5 text-label font-medium whitespace-nowrap text-brand hover:border-brand/40 hover:bg-brand-soft disabled:opacity-50"
            disabled={busy || record === undefined || !models.data?.profiles.length}
            onClick={() => void start()}
          >
            <RefreshCw
              aria-hidden="true"
              size={13}
              className={
                busy
                  ? 'motion-safe:animate-spin'
                  : 'motion-safe:transition-transform motion-safe:group-hover/audit-retry:rotate-45'
              }
            />
            {task ? '重新审计' : '发起审计'}
          </button>
        )}
      </ReviewAuditActivity>
      {task?.result && !report && (
        <p className="border-t border-separator px-3.5 py-2 text-caption text-warning">
          这份报告与候选内容不匹配，请重新审计。
        </p>
      )}
      {pending && report && (
        <div className="space-y-2 border-t border-warning/20 px-3.5 py-3 motion-safe:animate-[audit-action-in_260ms_var(--ease-out)_both]">
          <p className="whitespace-pre-wrap break-words">{suggestion}</p>
          <p className="text-caption text-muted-ink">
            采纳后，建议会带入空白审核意见。已有文字时可手动追加。
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={cn(btnStyles, btnPrimaryStyles)}
              disabled={busy || responded === pending.id}
              onClick={() => {
                void respond(true);
              }}
            >
              <Check aria-hidden="true" size={14} />
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
        </div>
      )}
      {report && (
        <details className="group/evidence border-t border-separator text-caption">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-3.5 py-2.5 font-medium text-brand hover:bg-brand-soft/50 focus-visible:-outline-offset-2 [&::-webkit-details-marker]:hidden">
            <FileText aria-hidden="true" size={14} />
            查看审计发现与文件依据
            <ChevronDown
              aria-hidden="true"
              size={14}
              className="ml-auto motion-safe:transition-transform group-open/evidence:rotate-180"
            />
          </summary>
          <div className="min-w-0 px-3.5 pb-3.5 text-body group-open/evidence:motion-safe:animate-[audit-action-in_260ms_var(--ease-out)_both]">
            <BusinessAssessment value={report} onEvidence={onEvidence} review />
          </div>
        </details>
      )}
      {(error || models.error || execution.error || task?.error) && (
        <p
          role="alert"
          className="border-t border-danger/20 bg-danger-soft/40 px-3.5 py-2 text-caption text-danger"
        >
          {error || models.error || execution.error || task?.error?.message}{' '}
          <button type="button" className={textBtnStyles} onClick={() => setRefresh((v) => v + 1)}>
            刷新
          </button>
        </p>
      )}
    </section>
  );
}
