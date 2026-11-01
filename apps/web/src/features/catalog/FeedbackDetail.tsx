import { BusinessAgentPanel } from '../ai/BusinessAgentPanel.js';
import { feedbackStatusIcons } from '../../shared/components/select-icons.js';
import { feedbackDetailStyles } from './styles.js';
import { subtleStyles, formStackStyles } from '../../shared/styles/recipes.js';
import {
  feedbackKinds,
  feedbackStatuses,
  type AssetFeedbackUpdateRequest,
} from '@capability-hub/contracts';
import type { AssetFeedbackResponse, VersionHistoryResponse } from '@capability-hub/contracts/http';
import { useState, type SubmitEvent } from 'react';
import { mutate } from '../../shared/api/client.js';
import { errorMessage } from '../../shared/api/error-message.js';
import { useQuery } from '../../shared/api/use-query.js';
import { Message } from '../../shared/components/Message.js';
import { SelectField } from '../../shared/components/SelectField.js';
import { Submit } from '../../shared/components/Submit.js';
import { dateLabel } from '../../shared/format/labels.js';

/**
 * 反馈详情只读展示：九段正文按固定顺序列出，空字段整行省略。
 * 仅 `can_manage` 的维护者会额外看到处理表单，`key` 绑定 `revision` 以便保存后重置表单状态。
 */
export function FeedbackDetail({
  feedback: f,
  onSaved,
}: {
  feedback: AssetFeedbackResponse;
  onSaved: () => void;
}) {
  return (
    <article className={feedbackDetailStyles} aria-label={'反馈详情：' + f.title}>
      <h4>{f.title}</h4>
      <p className={subtleStyles}>
        {feedbackKinds[f.kind]} · {f.version_label} · {feedbackStatuses[f.status]}
        {f.blocking ? ' · 阻塞任务' : ''}
      </p>
      <p className={subtleStyles}>
        编号 {f.id} · {dateLabel(f.created_at)}
      </p>
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
            ['处理说明', f.resolution],
            ['修复版本', f.fixed_version_label],
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
        onCompleted={onSaved}
      />
      {f.can_manage && (
        <FeedbackResolution key={f.id + ':' + f.revision} feedback={f} onSaved={onSaved} />
      )}
    </article>
  );
}
function FeedbackResolution({
  feedback: f,
  onSaved,
}: {
  feedback: AssetFeedbackResponse;
  onSaved: () => void;
}) {
  const [status, setStatus] = useState<AssetFeedbackUpdateRequest['status']>(f.status);
  const [resolution, setResolution] = useState(f.resolution);
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
      await mutate(
        `/api/feedback/${f.id}`,
        {
          revision: f.revision,
          status,
          resolution,
          fixed_version_id: status === 'resolved' && fixed ? fixed : null,
        },
        'PATCH',
      );
      onSaved();
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
            maxLength={2000}
            required={status === 'resolved' || status === 'declined'}
            value={resolution}
            onChange={(event) => setResolution(event.target.value)}
          />
        </label>
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
