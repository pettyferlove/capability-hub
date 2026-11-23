import {
  hubFeedbackAreas,
  hubFeedbackDeclineReasons,
  hubFeedbackKinds,
  hubFeedbackStatuses,
  hubFeedbackSurfaces,
} from '@capability-hub/contracts';
import type {
  HubFeedbackAttachmentResponse,
  HubFeedbackDetailResponse,
  HubFeedbackEventResponse,
} from '@capability-hub/contracts/http';
import { browserUuid } from '@capability-hub/logging/browser';
import { useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError, apiErrorContext, mutate } from '../../shared/api/client.js';
import { useQuery } from '../../shared/api/use-query.js';
import { CopyButton } from '../../shared/components/CopyButton.js';
import { DialogTitle } from '../../shared/components/DialogTitle.js';
import { ErrorState } from '../../shared/components/ErrorState.js';
import { Overlay } from '../../shared/components/Overlay.js';
import { QueryRegion } from '../../shared/components/QueryRegion.js';
import { Submit } from '../../shared/components/Submit.js';
import { useHub } from '../../shared/context/HubContext.js';
import { dateLabel } from '../../shared/format/labels.js';
import { notifyHubFeedbackChanged } from '../../shared/hub-feedback-events.js';
import { X } from '../../shared/icons/lucide.js';
import { cn } from '../../shared/styles/cn.js';
import {
  btnDangerStyles,
  btnPrimaryStyles,
  btnStyles,
  iconBtnStyles,
  subtleStyles,
  tagStyles,
  textBtnStyles,
} from '../../shared/styles/recipes.js';
import { HubFeedbackEvidence, hubFeedbackMarkdown } from './HubFeedbackEvidence.js';
import { HubFeedbackFiles } from './HubFeedbackFiles.js';
import { HubFeedbackHandling } from './HubFeedbackHandling.js';
import { FeedbackStatus } from './HubFeedbackList.js';
import { HubFeedbackReply } from './HubFeedbackReply.js';

interface ThreadProps {
  reference: string | null;
  handler?: boolean;
  onClose: () => void;
  onChanged: () => void;
}

type DestructiveAction =
  | { kind: 'close' }
  | { kind: 'description' }
  | { kind: 'event'; id: string }
  | { kind: 'attachment'; file: HubFeedbackAttachmentResponse };

type ReadAttempt = { revision: number; refresh: number; key: string };
const textStyles = 'whitespace-pre-wrap text-body leading-relaxed [overflow-wrap:anywhere]';
const actionLabel = {
  close: '结束反馈',
  description: '隐去问题描述',
  event: '隐去时间线内容',
  attachment: '移除附件',
};
const timelineLabels: Record<HubFeedbackEventResponse['kind'], string> = {
  comment: '留言',
  status: '更新状态',
  assignment: '变更负责人',
  attachment_removed: '移除附件',
  redaction: '隐去内容',
};
const actorLabels = { system: '系统', handler: '处理人员', submitter: '提交人' };

function Confirmation({
  action,
  onClose,
  onConfirm,
}: {
  action: DestructiveAction;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const title = '确认' + actionLabel[action.kind];
  const message =
    action.kind === 'close'
      ? '这条反馈将标记为已解决，结束后你不能再移除自己的附件。你仍可以留言。'
      : action.kind === 'attachment'
        ? `移除「${action.file.name}」后将不能预览或下载，时间线仍会保留移除记录。`
        : action.kind === 'description'
          ? '问题描述、复现步骤与预期结果将被隐去。这个操作不能撤销。'
          : '这条时间线事件的正文将被隐去。这个操作不能撤销。';
  return (
    <Overlay open label={title} variant="palette" onClose={onClose}>
      <DialogTitle title={title} onClose={onClose} />
      <p className={cn(textStyles, 'px-5 py-4')}>{message}</p>
      <div className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-3">
        <button type="button" className={btnStyles} onClick={onClose}>
          取消
        </button>
        <Submit type="button" className={btnDangerStyles} onClick={onConfirm}>
          {title}
        </Submit>
      </div>
    </Overlay>
  );
}

function ThreadContent({
  detail,
  path,
  handler,
  disabled,
  confirm,
}: {
  detail: HubFeedbackDetailResponse;
  path: string;
  handler: boolean;
  disabled: boolean;
  confirm: (action: DestructiveAction) => void;
}) {
  const attachments = useMemo(() => {
    const groups = new Map<string | null, HubFeedbackAttachmentResponse[]>();
    for (const item of detail.attachments) {
      const group = groups.get(item.event_id);
      if (group) group.push(item);
      else groups.set(item.event_id, [item]);
    }
    return groups;
  }, [detail.attachments]);
  const original = attachments.get(null);
  const removeAttachment = (file: HubFeedbackAttachmentResponse) =>
    confirm({ kind: 'attachment', file });
  return (
    <>
      <section
        className="space-y-4 rounded-xl border border-line bg-paper p-4"
        aria-label="原始反馈"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-section font-semibold">问题描述</h3>
          {handler && !detail.description_redacted_at && (
            <button
              type="button"
              className={cn(textBtnStyles, 'text-danger disabled:opacity-50')}
              disabled={disabled}
              onClick={() => confirm({ kind: 'description' })}
            >
              隐去描述
            </button>
          )}
        </div>
        {detail.description_redacted_at ? (
          <p className={subtleStyles}>
            内容已于{' '}
            <time dateTime={detail.description_redacted_at}>
              {dateLabel(detail.description_redacted_at)}
            </time>{' '}
            隐去
          </p>
        ) : (
          <p className={textStyles}>{detail.description}</p>
        )}
        {detail.steps && (
          <>
            <h4 className="text-label font-semibold">复现步骤</h4>
            <p className={textStyles}>{detail.steps}</p>
          </>
        )}
        {detail.expected && (
          <>
            <h4 className="text-label font-semibold">预期结果</h4>
            <p className={textStyles}>{detail.expected}</p>
          </>
        )}
        {original && (
          <div className="space-y-2 border-t border-line pt-3">
            <h4 className="text-label font-semibold">原始附件</h4>
            <HubFeedbackFiles
              files={original}
              path={path}
              disabled={disabled}
              onRemove={removeAttachment}
            />
          </div>
        )}
        {(handler || detail.diagnostics) && <HubFeedbackEvidence detail={detail} />}
      </section>
      <section className="space-y-3" aria-label="处理时间线">
        <h3 className="text-section font-semibold">处理时间线</h3>
        <ol className="space-y-3">
          <li className={subtleStyles}>
            <time dateTime={detail.created_at}>{dateLabel(detail.created_at)}</time> · 提交反馈
          </li>
          {detail.events.map((event) => {
            const files = attachments.get(event.id);
            const internal = event.visibility === 'internal';
            return (
              <li
                key={event.id}
                className={cn(
                  'space-y-2 rounded-xl border border-line bg-paper p-3',
                  internal && 'border-l-2 border-l-warning bg-warning-soft',
                )}
              >
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-label">
                  <strong className="[overflow-wrap:anywhere]">
                    {event.actor_name ?? actorLabels[event.actor_role]}
                  </strong>
                  <span>
                    {internal && event.kind === 'comment' ? '内部备注' : timelineLabels[event.kind]}
                  </span>
                  <time className="text-muted-ink" dateTime={event.created_at}>
                    {dateLabel(event.created_at)}
                  </time>
                  {internal && (
                    <span className="text-caption font-medium text-warning">仅处理人员可见</span>
                  )}
                </div>
                {event.status_to && (
                  <p className={subtleStyles}>
                    {event.status_from && `${hubFeedbackStatuses[event.status_from]} → `}
                    {hubFeedbackStatuses[event.status_to]}
                    {event.decline_reason &&
                      ` · ${hubFeedbackDeclineReasons[event.decline_reason]}`}
                  </p>
                )}
                {event.redacted_at ? (
                  <p className={subtleStyles}>
                    内容已于{' '}
                    <time dateTime={event.redacted_at}>{dateLabel(event.redacted_at)}</time> 隐去
                  </p>
                ) : event.body ? (
                  <p className={textStyles}>{event.body}</p>
                ) : null}
                {files && (
                  <HubFeedbackFiles
                    files={files}
                    path={path}
                    disabled={disabled}
                    onRemove={removeAttachment}
                  />
                )}
                {handler && event.body && !event.redacted_at && (
                  <button
                    type="button"
                    className={cn(textBtnStyles, 'text-danger disabled:opacity-50')}
                    disabled={disabled}
                    onClick={() => confirm({ kind: 'event', id: event.id })}
                  >
                    隐去内容
                  </button>
                )}
              </li>
            );
          })}
        </ol>
      </section>
    </>
  );
}

function FeedbackThread({
  reference,
  handler = false,
  onClose,
  onChanged,
}: Omit<ThreadProps, 'reference'> & { reference: string }) {
  const { refresh, me } = useHub();
  const handlerId = handler ? me?.id : undefined;
  const [detailRefresh, setDetailRefresh] = useState(0);
  const queryRefresh = refresh + detailRefresh;
  const base = handler ? '/api/admin/hub-feedback' : '/api/hub-feedback';
  const { data, error, errorStatus, errorRequestId, errorFailure, loading } =
    useQuery<HubFeedbackDetailResponse>(`${base}/${encodeURIComponent(reference)}`, queryRefresh);
  const [replacement, setReplacement] = useState<HubFeedbackDetailResponse>();
  const newest =
    replacement &&
    (!data ||
      replacement.revision > data.revision ||
      (replacement.revision === data.revision && data.unread && !replacement.unread))
      ? replacement
      : data;
  const detail =
    errorStatus === 401 || errorStatus === 403 || errorStatus === 404 ? undefined : newest;
  const markdown = useMemo(
    () => (handler && detail ? hubFeedbackMarkdown(detail) : ''),
    [detail, handler],
  );
  const [issue, setIssue] = useState<Error>();
  const [saving, setSaving] = useState(false);
  const [markingRead, setMarkingRead] = useState(false);
  const [replyOpen, setReplyOpen] = useState(false);
  const [confirmation, setConfirmation] = useState<{
    action: DestructiveAction;
    revision: number;
  }>();
  const writing = useRef(false);
  const readAttempt = useRef<ReadAttempt | undefined>(undefined);
  const id = detail?.id;
  const readRevision = detail?.unread ? detail.revision : undefined;
  const conflict = issue instanceof ApiError && issue.status === 412;

  useEffect(() => {
    if (handler || !id || readRevision === undefined || loading || error || conflict) return;
    const previous = readAttempt.current;
    if (previous?.revision === readRevision && previous.refresh === queryRefresh) return;
    const attempt = {
      revision: readRevision,
      refresh: queryRefresh,
      key: previous?.revision === readRevision ? previous.key : browserUuid(),
    };
    readAttempt.current = attempt;
    setMarkingRead(true);
    void api<HubFeedbackDetailResponse>(`${base}/${encodeURIComponent(id)}/read`, {
      method: 'POST',
      headers: { 'If-Match': `"${attempt.revision}"`, 'Idempotency-Key': attempt.key },
    }).then(
      (updated) => {
        if (readAttempt.current === attempt) {
          setReplacement((current) =>
            current && current.revision > updated.revision ? current : updated,
          );
          setMarkingRead(false);
        }
        notifyHubFeedbackChanged({ kind: 'read', id });
        onChanged();
      },
      (error: unknown) => {
        if (readAttempt.current !== attempt) return;
        setMarkingRead(false);
        setIssue(error instanceof Error ? error : new Error('无法将反馈标为已读'));
      },
    );
  }, [base, conflict, error, handler, id, loading, onChanged, queryRefresh, readRevision]);

  function reloadDetail() {
    setIssue(undefined);
    setConfirmation(undefined);
    setDetailRefresh((current) => current + 1);
  }

  const path = detail ? `${base}/${encodeURIComponent(detail.id)}` : base;
  const disabled = !!error || loading || saving || markingRead || conflict;

  async function run(request: () => Promise<HubFeedbackDetailResponse>, comment = false) {
    if (!detail || disabled || writing.current) return false;
    writing.current = true;
    setSaving(true);
    setIssue(undefined);
    try {
      const updated = await request();
      setReplacement((current) =>
        current && current.revision > updated.revision ? current : updated,
      );
      if (handler) notifyHubFeedbackChanged({ kind: 'handled' });
      else if (comment) notifyHubFeedbackChanged({ kind: 'commented' });
      onChanged();
      return true;
    } catch (error) {
      setIssue(error instanceof Error ? error : new Error('无法更新反馈'));
      return false;
    } finally {
      writing.current = false;
      setSaving(false);
    }
  }

  function confirm(action: DestructiveAction) {
    if (detail && !disabled) setConfirmation({ action, revision: detail.revision });
  }

  function applyConfirmation() {
    const pending = confirmation;
    setConfirmation(undefined);
    if (!detail || !pending) return;
    if (detail.revision !== pending.revision) {
      setIssue(new Error('反馈已更新，请核对最新内容后重新确认。'));
      return;
    }
    const { action } = pending;
    const revision = detail.revision;
    if (action.kind === 'close') {
      void run(() =>
        mutate<HubFeedbackDetailResponse>(path + '/close', undefined, 'POST', revision),
      );
    } else if (action.kind === 'attachment') {
      void run(() =>
        mutate<HubFeedbackDetailResponse>(
          `${path}/attachments/${encodeURIComponent(action.file.id)}`,
          undefined,
          'DELETE',
          revision,
        ),
      );
    } else {
      const command =
        action.kind === 'description'
          ? { target: 'description' }
          : { target: 'event', event_id: action.id };
      void run(() =>
        mutate<HubFeedbackDetailResponse>(path + '/redactions', command, 'POST', revision),
      );
    }
  }

  return (
    <>
      {detail ? (
        <header className="shrink-0 border-b border-line bg-paper px-4 py-3 sm:px-6">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 space-y-1.5">
              <div className="flex flex-wrap items-center gap-2 text-label tabular-nums">
                <span className="text-muted-ink">#{detail.number}</span>
                <FeedbackStatus status={detail.status} />
                {detail.blocking && (
                  <span className={cn(tagStyles, 'bg-danger-soft text-danger')}>阻塞工作</span>
                )}
                {handler && detail.awaiting_reply && <span className={tagStyles}>待回复</span>}
              </div>
              <h2 className="text-section font-semibold [overflow-wrap:anywhere]">
                {detail.title}
              </h2>
              <p className={subtleStyles}>
                {hubFeedbackKinds[detail.kind]} · {hubFeedbackSurfaces[detail.surface]}
                {detail.area && ` / ${hubFeedbackAreas[detail.area]}`}
                {detail.closed_at && (
                  <>
                    {' '}
                    · <time dateTime={detail.closed_at}>{dateLabel(detail.closed_at)} 已结束</time>
                  </>
                )}
                {detail.decline_reason && ` · ${hubFeedbackDeclineReasons[detail.decline_reason]}`}
                {handler && detail.duplicate_of && ` · 重复于 #${detail.duplicate_of}`}
              </p>
            </div>
            <button type="button" className={iconBtnStyles} aria-label="关闭" onClick={onClose}>
              <X size={20} aria-hidden="true" />
            </button>
          </div>
        </header>
      ) : (
        <DialogTitle title="反馈详情" onClose={onClose} />
      )}
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-6">
        <QueryRegion label="反馈详情内容" loading={loading} showProgress={!!detail}>
          {error && (
            <ErrorState
              message={error}
              status={errorStatus}
              requestId={errorRequestId}
              failure={errorFailure}
              retry={reloadDetail}
            />
          )}
          {!detail && !error && (
            <p role="status" className={subtleStyles}>
              正在加载反馈…
            </p>
          )}
          {detail && (
            <div className="space-y-5">
              <ThreadContent
                detail={detail}
                path={path}
                handler={handler}
                disabled={disabled}
                confirm={confirm}
              />
              {handlerId && (
                <HubFeedbackHandling
                  detail={detail}
                  handlerId={handlerId}
                  disabled={disabled}
                  update={(change) =>
                    run(() =>
                      mutate<HubFeedbackDetailResponse>(path, change, 'PATCH', detail.revision),
                    )
                  }
                />
              )}
            </div>
          )}
        </QueryRegion>
      </div>
      {issue && (
        <div className="shrink-0 border-t border-line px-4 py-2 sm:px-6">
          <ErrorState
            message={
              conflict ? '反馈已更新。请重新加载后再操作，未提交的留言会保留。' : issue.message
            }
            {...apiErrorContext(issue)}
            retry={conflict || detail?.unread ? reloadDetail : undefined}
          />
        </div>
      )}
      {detail && (
        <HubFeedbackReply
          handler={handler}
          closed={!!detail.closed_at}
          disabled={disabled}
          busy={saving}
          open={replyOpen}
          send={(form, key) =>
            run(
              () =>
                api<HubFeedbackDetailResponse>(path + '/comments', {
                  method: 'POST',
                  body: form,
                  headers: { 'If-Match': `"${detail.revision}"`, 'Idempotency-Key': key },
                }),
              true,
            )
          }
          footer={
            <>
              {handler && !replyOpen && (
                <CopyButton text={markdown} label="复制 Markdown" variant="secondary" />
              )}
              {!handler && !detail.closed_at && !replyOpen && (
                <button
                  type="button"
                  className={btnStyles}
                  disabled={disabled}
                  onClick={() => confirm({ kind: 'close' })}
                >
                  结束反馈
                </button>
              )}
              <button
                type="button"
                className={cn(btnStyles, !replyOpen && btnPrimaryStyles)}
                disabled={saving}
                aria-expanded={replyOpen}
                onClick={() => setReplyOpen((open) => !open)}
              >
                {replyOpen ? '收起留言' : handler ? '写回复' : '写留言'}
              </button>
            </>
          }
        />
      )}
      {confirmation && (
        <Confirmation
          action={confirmation.action}
          onClose={() => setConfirmation(undefined)}
          onConfirm={applyConfirmation}
        />
      )}
    </>
  );
}

export function HubFeedbackThread({ reference, onClose, ...props }: ThreadProps) {
  return (
    <Overlay
      open={!!reference}
      label="反馈详情"
      variant="sheet"
      size="wide"
      onClose={onClose}
      loadingKey={reference ?? undefined}
    >
      {reference && (
        <FeedbackThread key={reference} reference={reference} onClose={onClose} {...props} />
      )}
    </Overlay>
  );
}
