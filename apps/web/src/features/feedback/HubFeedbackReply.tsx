import { browserUuid } from '@capability-hub/logging/browser';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { SelectField } from '../../shared/components/SelectField.js';
import { Submit } from '../../shared/components/Submit.js';
import { cn } from '../../shared/styles/cn.js';
import { formStackStyles, subtleStyles } from '../../shared/styles/recipes.js';
import { AttachmentTray } from './AttachmentTray.js';
import { hubFeedbackForm, type HubFeedbackLocalFile } from './hub-feedback-api.js';

type Visibility = 'public' | 'internal';

export function HubFeedbackReply({
  handler,
  closed,
  disabled,
  busy,
  open,
  footer,
  send,
}: {
  handler: boolean;
  closed: boolean;
  disabled: boolean;
  busy: boolean;
  open: boolean;
  footer: ReactNode;
  send: (form: FormData, key: string) => Promise<boolean>;
}) {
  const id = useId();
  const [draft, setDraft] = useState('');
  const [visibility, setVisibility] = useState<Visibility>('public');
  const [files, setFiles] = useState<HubFeedbackLocalFile[]>([]);
  const [processing, setProcessing] = useState(false);
  const [sent, setSent] = useState('');
  const textarea = useRef<HTMLTextAreaElement>(null);
  const attempt = useRef<
    | {
        body: string;
        visibility: Visibility;
        files: HubFeedbackLocalFile[];
        key: string;
      }
    | undefined
  >(undefined);
  const body = draft.trim();

  useEffect(() => {
    if (open) textarea.current?.focus();
  }, [open]);

  async function submit() {
    if (!open || disabled || processing || !body) return;
    const previous = attempt.current;
    const same =
      previous?.body === body &&
      previous.visibility === visibility &&
      previous.files.length === files.length &&
      previous.files.every((file, index) => {
        const current = files[index];
        return (
          current?.file === file.file && current.name === file.name && current.kind === file.kind
        );
      });
    const key = same ? previous.key : browserUuid();
    attempt.current = { body, visibility, files, key };
    const form = hubFeedbackForm({ body, ...(handler && { visibility }) }, files);
    setSent('');
    if (!(await send(form, key))) return;
    attempt.current = undefined;
    setDraft('');
    setFiles([]);
    setSent(visibility === 'internal' ? '已保存内部备注' : handler ? '已发出回复' : '已发表留言');
  }

  return (
    <footer className="shrink-0 border-t border-line bg-paper">
      <form
        id={id}
        hidden={!open}
        className={
          open ? cn(formStackStyles, 'max-h-[43dvh] overflow-y-auto px-4 py-3 sm:px-6') : 'hidden'
        }
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        {handler && (
          <SelectField
            aria-label="留言可见范围"
            value={visibility}
            disabled={disabled}
            onValueChange={(next) => setVisibility(next === 'internal' ? 'internal' : 'public')}
          >
            <option value="public">公开回复</option>
            <option value="internal">内部备注</option>
          </SelectField>
        )}
        {handler && visibility === 'internal' && (
          <p className="rounded-lg bg-warning-soft px-3 py-2 text-label text-warning">
            仅处理人员可见
          </p>
        )}
        {!handler && closed && (
          <p className={subtleStyles}>反馈已结束，仍可留言。留言不会重新打开这条反馈。</p>
        )}
        <label className="grid gap-1.5 text-label font-medium">
          {handler ? (visibility === 'public' ? '回复内容' : '备注内容') : '留言内容'}
          <textarea
            disabled={disabled}
            maxLength={5000}
            ref={textarea}
            required
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
        </label>
        <AttachmentTray
          files={files}
          onChange={setFiles}
          disabled={disabled}
          enabled={open}
          onProcessingChange={setProcessing}
        />
      </form>
      <div className="flex flex-wrap items-center justify-end gap-2 px-4 py-3 sm:px-6">
        {sent && (
          <p role="status" className={cn(subtleStyles, 'mr-auto')}>
            {sent}
          </p>
        )}
        {footer}
        {open && (
          <Submit type="submit" form={id} disabled={disabled || processing || !body} busy={busy}>
            {handler ? (visibility === 'public' ? '发出公开回复' : '保存内部备注') : '发表留言'}
          </Submit>
        )}
      </div>
    </footer>
  );
}
