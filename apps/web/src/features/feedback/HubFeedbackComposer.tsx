import {
  hubFeedbackAreas,
  hubFeedbackKinds,
  hubFeedbackSurfaces,
  type HubFeedbackDiagnostics,
  type HubFeedbackKind,
} from '@capability-hub/contracts';
import type { SubmitEvent } from 'react';
import { Button, Label, RadioButton, RadioField, RadioGroup } from 'react-aria-components';
import { Message } from '../../shared/components/Message.js';
import { SelectField } from '../../shared/components/SelectField.js';
import { ArrowUpRight, Send } from '../../shared/icons/lucide.js';
import { shouldHandleLink } from '../../shared/navigation/history-navigation.js';
import { assetHref, type HubRoute } from '../../shared/navigation/history-route.js';
import { cn } from '../../shared/styles/cn.js';
import {
  btnPrimaryStyles,
  btnStyles,
  formStackStyles,
  subtleStyles,
  textBtnStyles,
} from '../../shared/styles/recipes.js';
import { AttachmentTray } from './AttachmentTray.js';
import { DiagnosticsPreview, FeedbackCheckbox } from './DiagnosticsPreview.js';
import { defaultArea, defaultSurface, type DraftOrigin, type FeedbackDraft } from './draft.js';
import type { DiagnosticGroup, DiagnosticRows, DiagnosticSnapshot } from './diagnostics.js';
import type { HubFeedbackLocalFile } from './hub-feedback-api.js';
import {
  feedbackDisclosureStyles,
  feedbackEvidenceStyles,
  feedbackFieldStyles,
  feedbackFooterStyles,
  feedbackRadioStyles,
  feedbackScrollStyles,
} from './styles.js';

const optionalFields = [
  ['steps', '复现步骤', 3000],
  ['expected', '期望结果', 2000],
] as const;

export function HubFeedbackComposer({
  draft,
  origin,
  route,
  sample,
  rows,
  payload,
  files,
  filesLost,
  enabled,
  busy,
  processing,
  error,
  onDraftChange,
  onChoice,
  onRowChoice,
  onFilesChange,
  onProcessingChange,
  onResourceLink,
  onSubmit,
}: {
  draft: FeedbackDraft;
  origin: DraftOrigin;
  route: HubRoute;
  sample: DiagnosticSnapshot;
  rows: DiagnosticRows;
  payload: HubFeedbackDiagnostics | null;
  files: HubFeedbackLocalFile[];
  filesLost: boolean;
  enabled: boolean;
  busy: boolean;
  processing: boolean;
  error: string;
  onDraftChange: (update: Partial<FeedbackDraft>) => void;
  onChoice: (group: DiagnosticGroup, selected: boolean) => void;
  onRowChoice: (group: 'requests' | 'errors', index: number, selected: boolean) => void;
  onFilesChange: (files: HubFeedbackLocalFile[]) => void;
  onProcessingChange: (value: boolean) => void;
  onResourceLink: () => void;
  onSubmit: () => void;
}) {
  const area = defaultArea(origin);
  const pageLabel = origin.page === 'not-found' ? '页面未找到' : hubFeedbackAreas[area];
  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!busy && !processing && enabled) onSubmit();
  }

  return (
    <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col" aria-busy={busy}>
      <div className={cn(feedbackScrollStyles, formStackStyles)}>
        <div className="grid gap-1 border-b border-line pb-3">
          <p className={subtleStyles}>当前页面：{pageLabel}</p>
          {route.asset && (
            <p className={subtleStyles}>
              与此资源有关的问题？{' '}
              <a
                href={`${assetHref(route.asset)}?tab=feedback`}
                className={textBtnStyles}
                onClick={(event) => {
                  if (busy || processing) {
                    event.preventDefault();
                    return;
                  }
                  if (shouldHandleLink(event, '', false)) onResourceLink();
                }}
              >
                前往资源的「问题与建议」 <ArrowUpRight size={13} aria-hidden="true" />
              </a>
            </p>
          )}
        </div>
        <RadioGroup
          value={draft.kind}
          onChange={(kind) => onDraftChange({ kind: kind as HubFeedbackKind })}
          isDisabled={busy}
          className="grid gap-1.5"
        >
          <Label className="text-label font-medium">类型</Label>
          <div className="flex flex-wrap gap-2">
            {Object.entries(hubFeedbackKinds).map(([key, label]) => (
              <RadioField key={key} value={key}>
                <RadioButton className={feedbackRadioStyles}>{label}</RadioButton>
              </RadioField>
            ))}
          </div>
        </RadioGroup>
        <div className="grid grid-cols-2 gap-3">
          <label className={feedbackFieldStyles}>
            位置
            <SelectField
              value={draft.surface ?? defaultSurface(origin)}
              disabled={busy}
              onValueChange={(surface) =>
                onDraftChange({
                  surface:
                    surface === defaultSurface(origin)
                      ? undefined
                      : (surface as FeedbackDraft['surface']),
                })
              }
            >
              {Object.entries(hubFeedbackSurfaces).map(([value, label]) => (
                <option value={value} key={value}>
                  {label}
                </option>
              ))}
            </SelectField>
          </label>
          <label className={feedbackFieldStyles}>
            模块
            <SelectField
              value={draft.area ?? area}
              disabled={busy}
              onValueChange={(value) =>
                onDraftChange({
                  area: value === area ? undefined : (value as FeedbackDraft['area']),
                })
              }
            >
              {Object.entries(hubFeedbackAreas).map(([value, label]) => (
                <option value={value} key={value}>
                  {label}
                </option>
              ))}
            </SelectField>
          </label>
        </div>
        <label className={feedbackFieldStyles}>
          标题
          <input
            name="title"
            required
            disabled={busy}
            maxLength={120}
            placeholder="一句话说明问题或建议"
            value={draft.title}
            onChange={(event) => onDraftChange({ title: event.currentTarget.value })}
          />
        </label>
        <label className={feedbackFieldStyles}>
          描述
          <textarea
            name="description"
            required
            disabled={busy}
            rows={4}
            maxLength={5000}
            placeholder="你当时在做什么？实际发生了什么？"
            value={draft.description}
            onChange={(event) => onDraftChange({ description: event.currentTarget.value })}
          />
        </label>
        <div className="grid gap-1">
          <FeedbackCheckbox
            label="阻塞我的工作"
            isSelected={draft.blocking}
            isDisabled={busy}
            onChange={(blocking) => onDraftChange({ blocking })}
          />
          <details open={draft.steps || draft.expected ? true : undefined}>
            <summary className={feedbackDisclosureStyles}>补充复现步骤与期望结果（可选）</summary>
            <div className="mt-2 grid gap-3">
              {optionalFields.map(([name, label, maxLength]) => (
                <label key={name} className={feedbackFieldStyles}>
                  {label}
                  <textarea
                    name={name}
                    value={draft[name]}
                    disabled={busy}
                    rows={2}
                    maxLength={maxLength}
                    onChange={(event) => onDraftChange({ [name]: event.currentTarget.value })}
                  />
                </label>
              ))}
            </div>
          </details>
        </div>
        <div className={feedbackEvidenceStyles}>
          {filesLost && (
            <Message>刷新页面或重新登录后不会保留原附件，请重新添加需要提交的文件。</Message>
          )}
          <AttachmentTray
            files={files}
            onChange={onFilesChange}
            onProcessingChange={onProcessingChange}
            enabled={enabled}
            disabled={busy}
            screenCapture
          />
          <div className="border-t border-line pt-4">
            <DiagnosticsPreview
              sample={sample}
              choices={draft.choices}
              rows={rows}
              payload={payload}
              onChoice={onChoice}
              onRowChoice={onRowChoice}
              disabled={busy}
            />
          </div>
        </div>
      </div>
      <footer className={feedbackFooterStyles}>
        {error && (
          <Message error className="w-full">
            {error}
          </Message>
        )}
        <p className={cn(subtleStyles, 'max-w-81 flex-1 basis-60 text-caption')}>
          仅你和平台处理人员可见。请勿包含密码、令牌或业务机密；可用「遮挡」盖住截图中的敏感信息。
        </p>
        <Button
          type="submit"
          isDisabled={busy || processing}
          className={cn(btnStyles, btnPrimaryStyles, 'ml-auto')}
        >
          <Send size={15} aria-hidden="true" />
          {busy ? '正在提交…' : '提交反馈'}
        </Button>
      </footer>
    </form>
  );
}
