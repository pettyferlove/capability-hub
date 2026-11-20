import {
  hubFeedbackDeclineReasons,
  hubFeedbackStatuses,
  type HubFeedbackDeclineReason,
  type HubFeedbackStatus,
  type HubFeedbackUpdateRequest,
} from '@capability-hub/contracts';
import type { HubFeedbackDetailResponse } from '@capability-hub/contracts/http';
import { useState } from 'react';
import { SelectField } from '../../shared/components/SelectField.js';
import { Submit } from '../../shared/components/Submit.js';
import { cn } from '../../shared/styles/cn.js';
import {
  btnStyles,
  formStackStyles,
  monoStyles,
  subtleStyles,
} from '../../shared/styles/recipes.js';

const transitions: Readonly<Record<HubFeedbackStatus, readonly HubFeedbackStatus[]>> = {
  pending: ['in_progress', 'needs_info', 'resolved', 'declined'],
  in_progress: ['needs_info', 'resolved', 'declined'],
  needs_info: ['resolved', 'declined'],
  resolved: ['in_progress'],
  declined: ['in_progress'],
};

export function HubFeedbackHandling({
  detail,
  handlerId,
  disabled,
  update,
}: {
  detail: HubFeedbackDetailResponse;
  handlerId: string;
  disabled: boolean;
  update: (change: HubFeedbackUpdateRequest) => Promise<boolean>;
}) {
  const [draftStatus, setStatus] = useState('');
  const [draftReason, setReason] = useState('');
  const [duplicate, setDuplicate] = useState('');
  const [message, setMessage] = useState('');
  const allowed = transitions[detail.status];
  const status = allowed.find((value) => value === draftStatus);
  const reason = status === 'declined' ? (draftReason as HubFeedbackDeclineReason) : '';
  const needsMessage = status === 'declined' || status === 'resolved' || status === 'needs_info';
  const number = Number(duplicate);
  const validDuplicate =
    /^[1-9]\d{0,9}$/.test(duplicate) && number <= 2147483647 && number !== detail.number;
  const valid =
    !!status &&
    (!needsMessage || !!message.trim()) &&
    (status !== 'declined' || (!!reason && (reason !== 'duplicate' || validDuplicate)));

  async function save() {
    if (!valid || disabled) return;
    const ok = await update({
      status,
      ...(reason && { decline_reason: reason }),
      ...(reason === 'duplicate' && { duplicate_of: number }),
      ...(message.trim() && { message: message.trim() }),
    });
    if (!ok) return;
    setStatus('');
    setReason('');
    setDuplicate('');
    setMessage('');
  }

  return (
    <details className="rounded-xl border border-line bg-paper px-4 py-3">
      <summary className="cursor-pointer text-label font-semibold">处理反馈</summary>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <p className={subtleStyles}>
          负责人：{' '}
          {detail.assignee_id === handlerId ? (
            '我'
          ) : detail.assignee_id ? (
            <code className={monoStyles}>{detail.assignee_id}</code>
          ) : (
            '未分配'
          )}
        </p>
        <button
          type="button"
          className={btnStyles}
          disabled={disabled || detail.assignee_id === handlerId}
          onClick={() => {
            void update({ assignee_id: handlerId });
          }}
        >
          认领给我
        </button>
        <button
          type="button"
          className={btnStyles}
          disabled={disabled || !detail.assignee_id}
          onClick={() => {
            void update({ assignee_id: null });
          }}
        >
          取消分配
        </button>
      </div>
      <form
        className={cn(formStackStyles, 'mt-4 border-t border-line pt-4')}
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <label className="grid gap-1.5 text-label">
          新状态
          <SelectField
            aria-label="新状态"
            value={status ?? ''}
            onValueChange={setStatus}
            disabled={disabled}
          >
            <option value="">请选择</option>
            {allowed.map((value) => (
              <option key={value} value={value}>
                {hubFeedbackStatuses[value]}
              </option>
            ))}
          </SelectField>
        </label>
        {status === 'declined' && (
          <label className="grid gap-1.5 text-label">
            不采纳原因
            <SelectField
              aria-label="不采纳原因"
              value={draftReason}
              onValueChange={setReason}
              disabled={disabled}
              required
            >
              <option value="">请选择原因</option>
              {Object.entries(hubFeedbackDeclineReasons).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </SelectField>
          </label>
        )}
        {reason === 'duplicate' && (
          <label className="grid gap-1.5 text-label">
            重复反馈编号（不含 #）
            <input
              inputMode="numeric"
              maxLength={10}
              value={duplicate}
              disabled={disabled}
              required
              onChange={(event) => setDuplicate(event.target.value.trim())}
            />
          </label>
        )}
        {status && (
          <label className="grid gap-1.5 text-label">
            {status === 'needs_info' ? '请提交人补充的信息' : '处理说明'}
            {!needsMessage && '（选填）'}
            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              maxLength={5000}
              disabled={disabled}
              required={needsMessage}
            />
            <span className={subtleStyles}>处理说明会发给提交人。</span>
          </label>
        )}
        <Submit type="submit" className="self-start" disabled={disabled || !valid}>
          保存状态
        </Submit>
      </form>
    </details>
  );
}
