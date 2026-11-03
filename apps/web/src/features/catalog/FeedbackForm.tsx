import { shortVersion } from '../../shared/format/version-label.js';
import { browserUuid } from '@capability-hub/logging/browser';
import { InputField } from '../../shared/components/InputField.js';
import { feedbackKindIcons } from '../../shared/components/select-icons.js';
import { checkLabelStyles } from '../../shared/styles/recipes.js';
import { formStackStyles, subtleStyles } from '../../shared/styles/recipes.js';
import { feedbackFormStyles } from './styles.js';
import { cn } from '../../shared/styles/cn.js';
import { feedbackKinds, type AssetFeedbackRequest } from '@capability-hub/contracts';
import type { AssetFeedbackResponse, VersionHistoryResponse } from '@capability-hub/contracts/http';
import { useRef, useState, type SubmitEvent } from 'react';
import { mutate } from '../../shared/api/client.js';
import { errorMessage } from '../../shared/api/error-message.js';
import { useQuery } from '../../shared/api/use-query.js';
import { ErrorState } from '../../shared/components/ErrorState.js';
import { Message } from '../../shared/components/Message.js';
import { SelectField } from '../../shared/components/SelectField.js';
import { Submit } from '../../shared/components/Submit.js';

const fields = [
  ['title', '反馈标题', 160, true],
  ['scenario', '业务场景与目标', 2000, true],
  ['expected', '预期行为', 2000, true],
  ['actual', '实际观察到的现象', 2000, true],
  ['location', '相关文件路径或 MCP 工具名称', 240, false],
  ['reproduction', '复现步骤', 4000, false],
  ['evidence', '脱敏证据摘要', 4000, false],
  ['suggestion', '推断原因或改进建议（未经确认）', 2000, false],
] as const;

/**
 * 提交问题或建议：字段上限见 `fields`，正文内容不变时复用同一 `idempotency_key`，
 * 因此失败重试不会产生重复反馈，改动任一字段才会换新 key。
 * `pending` 同步挡住连点，避免在请求返回前重复提交。
 */
export function FeedbackForm({
  assetId,
  versionId,
  onSubmitted,
}: {
  assetId: string;
  versionId: string;
  onSubmitted: (feedback: AssetFeedbackResponse) => void;
}) {
  const [kind, setKind] = useState<AssetFeedbackRequest['kind']>('defect');
  const [version, setVersion] = useState(versionId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef(false);
  const retry = useRef<{ body: string; key: string } | null>(null);
  const [versionsRefresh, setVersionsRefresh] = useState(0);
  const { data: versions, error: versionsError } = useQuery<VersionHistoryResponse[]>(
    `/api/assets/${assetId}/versions`,
    versionsRefresh,
  );
  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    const form = event.currentTarget;
    const values = new FormData(form);
    const text = (name: string) => {
      const value = values.get(name);
      return typeof value === 'string' ? value : '';
    };
    const content = {
      version_id: version,
      kind,
      title: text('title'),
      scenario: text('scenario'),
      expected: text('expected'),
      actual: text('actual'),
      location: text('location'),
      reproduction: text('reproduction'),
      evidence: text('evidence'),
      suggestion: text('suggestion'),
      blocking: values.get('blocking') === 'on',
      consent: values.get('consent') === 'on',
    };
    const body = JSON.stringify(content);
    if (retry.current?.body !== body) retry.current = { body, key: browserUuid() };
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      const feedback = await mutate<AssetFeedbackResponse>('/api/feedback', {
        ...content,
        idempotency_key: retry.current.key,
      });
      retry.current = null;
      form.reset();
      onSubmitted(feedback);
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <form
      className={cn(formStackStyles, feedbackFormStyles, '[&_textarea]:min-h-20!')}
      onSubmit={submit}
    >
      <fieldset disabled={busy} className={formStackStyles}>
        <div className="grid grid-cols-2 gap-4 max-[520px]:grid-cols-1">
          <label>
            反馈版本
            <SelectField value={version} onValueChange={setVersion} required>
              {versions ? (
                versions.map((item) => (
                  <option key={item.version_id} value={item.version_id}>
                    {shortVersion(item.version_label, true)}
                  </option>
                ))
              ) : (
                <option value={versionId}>当前版本</option>
              )}
            </SelectField>
          </label>
          <label>
            反馈类型
            <SelectField
              optionIcons={feedbackKindIcons}
              value={kind}
              onValueChange={(value) => setKind(value as AssetFeedbackRequest['kind'])}
            >
              {Object.entries(feedbackKinds).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </SelectField>
          </label>
        </div>
        {versionsError && (
          <ErrorState
            message={`版本列表加载失败：${versionsError}`}
            retry={() => setVersionsRefresh((value) => value + 1)}
          />
        )}
        {fields
          .filter(([, , , required]) => required)
          .map(([name, label, max, required]) => (
            <label key={name}>
              {label}（必填）
              {name === 'title' ? (
                <InputField
                  icon="text"
                  name={name}
                  required={required}
                  maxLength={max}
                  placeholder="一句话说明问题或改进目标"
                />
              ) : (
                <textarea
                  name={name}
                  required={required}
                  maxLength={max}
                  rows={2}
                  placeholder={
                    name === 'scenario'
                      ? '你想完成什么任务？'
                      : name === 'expected'
                        ? '希望得到什么结果？'
                        : '目前发生了什么，或缺少什么能力？'
                  }
                />
              )}
            </label>
          ))}
        <details className="rounded-lg border border-[color:var(--line)] p-3">
          <summary className="cursor-pointer font-medium">补充复现步骤与证据（可选）</summary>
          <div className={cn(formStackStyles, 'mt-4')}>
            {fields
              .filter(([, , , required]) => !required)
              .map(([name, label, max]) => (
                <label key={name}>
                  {label}
                  {name === 'location' ? (
                    <InputField
                      icon="text"
                      name={name}
                      maxLength={max}
                      placeholder="例如：设置页 → 令牌管理"
                    />
                  ) : (
                    <textarea
                      name={name}
                      maxLength={max}
                      rows={2}
                      placeholder={
                        name === 'reproduction'
                          ? '按步骤描述如何复现，必要时附链接'
                          : name === 'evidence'
                            ? '粘贴脱敏后的日志、截图说明或链接'
                            : '写下你推断的原因或改进方向（可选）'
                      }
                    />
                  )}
                </label>
              ))}
          </div>
        </details>
        <label className={checkLabelStyles}>
          <input name="blocking" type="checkbox" />
          <span>该问题阻塞当前任务</span>
        </label>
        <p className={subtleStyles}>
          仅你和资产维护者可见。请勿提交密钥、完整对话、业务源码或未脱敏日志。
        </p>
        <label className={checkLabelStyles}>
          <input name="consent" type="checkbox" required />
          <span>我已检查并脱敏内容，同意提交给资产维护者</span>
        </label>
        {error && <Message error>{error}</Message>}
        <Submit busy={busy}>提交反馈</Submit>
      </fieldset>
    </form>
  );
}
