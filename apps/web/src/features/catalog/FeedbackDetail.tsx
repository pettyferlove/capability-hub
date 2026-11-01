import { jsonObject } from '../ai/presentation.js';
import { BusinessAgentPanel } from '../ai/BusinessAgentPanel.js';
import { feedbackStatusIcons } from '../../shared/components/select-icons.js';
import { feedbackDetailStyles } from './styles.js';
import { subtleStyles, formStackStyles } from '../../shared/styles/recipes.js';
import {
  feedbackKinds,
  feedbackStatuses,
  type AiExecutionResponse,
  type AssetFeedbackUpdateRequest,
} from '@capability-hub/contracts';
import type { AssetFeedbackResponse, VersionHistoryResponse } from '@capability-hub/contracts/http';
import { useEffect, useRef, useState, type RefObject, type SubmitEvent } from 'react';
import { mutate } from '../../shared/api/client.js';
import { errorMessage } from '../../shared/api/error-message.js';
import { useQuery } from '../../shared/api/use-query.js';
import { Message } from '../../shared/components/Message.js';
import { SelectField } from '../../shared/components/SelectField.js';
import { Submit } from '../../shared/components/Submit.js';
import { dateLabel } from '../../shared/format/labels.js';

/**
 * 反馈详情先展示处理结果，再列出提交内容。
 * 仅 `can_manage` 的维护者会额外看到处理表单，`key` 绑定 `revision` 以便保存后重置表单状态。
 */
export function FeedbackDetail({
  feedback,
  onRefresh,
}: {
  feedback: AssetFeedbackResponse;
  onRefresh: () => void;
}) {
  const [saved, setSaved] = useState<AssetFeedbackResponse>();
  const [completed, setCompleted] = useState<AiExecutionResponse>();
  const adopting = useRef<string>(undefined);
  const editor = useRef<HTMLTextAreaElement>(null);
  const result = useRef<HTMLElement>(null);
  const f = saved?.id === feedback.id && saved.revision > feedback.revision ? saved : feedback;
  const report = jsonObject(completed?.result);
  const suggested = jsonObject(report.assessment).suggested_resolution;
  const suggestion =
    f.can_manage &&
    completed?.operation_id === 'feedback-triage' &&
    report.feedback_id === f.id &&
    report.version_id === f.version_id &&
    report.feedback_revision === f.revision &&
    report.approved === true &&
    report.feedback_applied === false &&
    typeof suggested === 'string'
      ? suggested
      : undefined;
  useEffect(() => {
    if (suggestion && adopting.current && adopting.current === completed?.id) {
      adopting.current = undefined;
      editor.current?.focus();
    }
  }, [completed, suggestion]);
  useEffect(() => {
    if (saved) result.current?.focus();
  }, [saved]);
  return (
    <article className={feedbackDetailStyles} aria-label={'反馈详情：' + f.title}>
      <h4>{f.title}</h4>
      <p className={subtleStyles}>
        {feedbackKinds[f.kind]} · {f.version_label}
        {f.blocking ? ' · 阻塞任务' : ''}
      </p>
      <p className={subtleStyles}>
        编号 {f.id} · {dateLabel(f.created_at)}
      </p>
      <section
        ref={result}
        tabIndex={-1}
        aria-label="处理结果"
        className="mt-4 space-y-2 rounded-xl border border-separator bg-page p-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h5 className="font-semibold">处理结果</h5>
          <span className="whitespace-nowrap text-caption text-brand">
            {feedbackStatuses[f.status]}
          </span>
        </div>
        <p className="whitespace-pre-wrap">
          {f.resolution || (f.updated_by ? '本次未填写处理说明。' : '尚无处理记录。')}
        </p>
        {f.fixed_version_label && <p>修复版本 · {f.fixed_version_label}</p>}
        {f.updated_by && <p className={subtleStyles}>更新于 {dateLabel(f.updated_at)}</p>}
        {suggestion && (
          <button
            type="button"
            className="text-caption font-semibold text-brand underline"
            onClick={() => editor.current?.focus()}
          >
            研判已采纳 · 查看处理说明草稿
          </button>
        )}
        {saved?.id === f.id && saved.revision === f.revision && (
          <p role="status" className="text-caption text-brand">
            处理结果已保存。
          </p>
        )}
      </section>
      <dl>
        {(
          [
            ['业务场景与目标', f.scenario],
            ['预期行为', f.expected],
            ['实际观察', f.actual],
            ['相关位置', f.location],
            ['复现步骤', f.reproduction],
            ['脱敏证据', f.evidence],
            ['推断原因或建议（未经确认）', f.suggestion],
          ] as const
        ).map(([label, value]) =>
          value ? (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ) : null,
        )}
      </dl>
      <BusinessAgentPanel
        versionId={f.version_id}
        feedbackId={f.id}
        title={f.title}
        onAdopt={({ executionId }) => {
          adopting.current = executionId;
        }}
        onCompleted={(execution) => {
          setCompleted(execution);
          onRefresh();
        }}
      />
      {f.can_manage && (
        <FeedbackResolution
          key={f.id + ':' + f.revision}
          feedback={f}
          editor={editor}
          suggestion={suggestion}
          onSaved={(updated) => {
            setSaved(updated);
            onRefresh();
          }}
        />
      )}
    </article>
  );
}

function FeedbackResolution({
  feedback: f,
  editor,
  suggestion,
  onSaved,
}: {
  feedback: AssetFeedbackResponse;
  editor: RefObject<HTMLTextAreaElement | null>;
  suggestion?: string;
  onSaved: (updated: AssetFeedbackResponse) => void;
}) {
  const [status, setStatus] = useState<AssetFeedbackUpdateRequest['status']>(f.status);
  const [draft, setDraft] = useState<string>();
  const resolution = draft ?? (f.resolution || suggestion || '');
  const [fixed, setFixed] = useState(f.fixed_version_id ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const { data: versions } = useQuery<VersionHistoryResponse[]>(
    `/api/management/assets/${f.asset_id}/versions`,
  );
  async function save(event: SubmitEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const updated = await mutate<AssetFeedbackResponse>(
        `/api/feedback/${f.id}`,
        {
          revision: f.revision,
          status,
          resolution,
          fixed_version_id: status === 'resolved' && fixed ? fixed : null,
        },
        'PATCH',
      );
      onSaved(updated);
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className={formStackStyles} onSubmit={save}>
      <fieldset disabled={busy} className={formStackStyles}>
        <legend>处理反馈</legend>
        <label>
          处理状态
          <SelectField
            optionIcons={feedbackStatusIcons}
            value={status}
            onValueChange={(value) => setStatus(value as AssetFeedbackUpdateRequest['status'])}
          >
            {Object.entries(feedbackStatuses).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </SelectField>
        </label>
        <label>
          处理说明
          <textarea
            ref={editor}
            maxLength={2000}
            required={status === 'resolved' || status === 'declined'}
            value={resolution}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="说明处理结果；拒绝时写明原因…"
          />
        </label>
        {suggestion && (
          <aside className="space-y-1 rounded-lg bg-page px-3 py-2 text-caption">
            {resolution === suggestion ? (
              <p>已采用研判建议，点击「保存处理结果」后生效。</p>
            ) : (
              <>
                <p className="whitespace-pre-wrap">{suggestion}</p>
                <button
                  type="button"
                  className="font-semibold text-brand underline"
                  onClick={() => {
                    setDraft(suggestion);
                    editor.current?.focus();
                  }}
                >
                  使用研判建议替换当前说明
                </button>
              </>
            )}
          </aside>
        )}
        {status === 'resolved' && (
          <label>
            修复版本（可选）
            <SelectField value={fixed} onValueChange={setFixed}>
              <option value="">不关联版本</option>
              {versions?.map((version) => (
                <option key={version.version_id} value={version.version_id}>
                  {version.version_label}
                </option>
              ))}
            </SelectField>
          </label>
        )}
        {error && <Message error>{error}</Message>}
        <Submit busy={busy}>保存处理结果</Submit>
      </fieldset>
    </form>
  );
}
