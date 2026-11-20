import type { HubFeedbackAttachmentResponse } from '@capability-hub/contracts/http';
import { useEffect, useState } from 'react';
import { apiErrorContext, hubFeedbackAttachmentText } from '../../shared/api/client.js';
import { DialogTitle } from '../../shared/components/DialogTitle.js';
import { ErrorState } from '../../shared/components/ErrorState.js';
import { Overlay } from '../../shared/components/Overlay.js';
import { bytesLabel, dateLabel } from '../../shared/format/labels.js';
import { Download } from '../../shared/icons/lucide.js';
import { cn } from '../../shared/styles/cn.js';
import { monoStyles, subtleStyles, textBtnStyles } from '../../shared/styles/recipes.js';

function TextPreview({ path }: { path: string }) {
  const [result, setResult] = useState<{ text: string } | { error: unknown }>();
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void hubFeedbackAttachmentText(path, controller.signal).then(
      (text) => {
        if (!controller.signal.aborted) setResult({ text });
      },
      (error: unknown) => {
        if (!controller.signal.aborted) setResult({ error });
      },
    );
    return () => controller.abort();
  }, [path, retry]);
  if (!result)
    return (
      <p role="status" className={subtleStyles}>
        正在读取附件…
      </p>
    );
  if ('error' in result) {
    const error = result.error;
    return (
      <ErrorState
        message={error instanceof Error ? error.message : '无法读取附件'}
        {...apiErrorContext(error)}
        retry={() => {
          setResult(undefined);
          setRetry((current) => current + 1);
        }}
      />
    );
  }
  return (
    <>
      <p className={subtleStyles}>为便于查看，预览最多显示前 200 行。</p>
      <pre className={cn(monoStyles, 'max-h-[60dvh] overflow-auto whitespace-pre-wrap text-label')}>
        {result.text || '附件为空'}
      </pre>
    </>
  );
}

function FeedbackFile({
  file,
  path,
  disabled,
  onRemove,
}: {
  file: HubFeedbackAttachmentResponse;
  path: string;
  disabled: boolean;
  onRemove: (file: HubFeedbackAttachmentResponse) => void;
}) {
  const [preview, setPreview] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const image = file.media_type.startsWith('image/');
  const available = !file.removed_at;
  return (
    <li className="min-w-0 rounded-xl border border-line bg-paper p-3">
      <p className="text-label font-medium [overflow-wrap:anywhere]">{file.name}</p>
      <p className={subtleStyles}>
        {bytesLabel(file.size)}
        {file.width && file.height ? ` · ${file.width} × ${file.height}` : ''}
        {file.removed_at && (
          <>
            {' '}
            · <time dateTime={file.removed_at}>{dateLabel(file.removed_at)} 已移除</time>
          </>
        )}
      </p>
      {image && available && !imageFailed && (
        <button
          type="button"
          className="mt-2 block max-w-full rounded-lg border border-line bg-page"
          onClick={() => setPreview(true)}
          aria-label={'查看大图：' + file.name}
        >
          <img
            src={path}
            loading="lazy"
            alt=""
            className="max-h-28 max-w-full rounded-lg object-contain"
            onError={() => setImageFailed(true)}
          />
        </button>
      )}
      {available && (
        <div className="mt-1 flex flex-wrap items-center gap-x-4">
          {!image && (
            <button type="button" className={textBtnStyles} onClick={() => setPreview(true)}>
              查看文本
            </button>
          )}
          <a download className={textBtnStyles} href={path} aria-label={'下载：' + file.name}>
            <Download size={14} aria-hidden="true" />
            下载
          </a>
          {file.can_remove && (
            <button
              type="button"
              className={cn(textBtnStyles, 'text-danger disabled:opacity-50')}
              disabled={disabled}
              onClick={() => onRemove(file)}
              aria-label={'移除附件：' + file.name}
            >
              移除
            </button>
          )}
        </div>
      )}
      <Overlay
        open={preview && available}
        label={'附件预览：' + file.name}
        variant="showcase"
        size={image ? 'workspace' : undefined}
        onClose={() => setPreview(false)}
      >
        <div className={image ? 'flex h-full flex-col [&_h2]:min-w-0 [&_h2]:truncate' : undefined}>
          <DialogTitle title={file.name} onClose={() => setPreview(false)} />
          {image ? (
            <div className="flex min-h-0 flex-1 items-center justify-center bg-page p-2 sm:p-4">
              {imageFailed ? (
                <p className={subtleStyles}>图片无法显示，请尝试下载附件。</p>
              ) : (
                <img
                  src={path}
                  alt={file.name}
                  className="block size-full object-scale-down"
                  onError={() => setImageFailed(true)}
                />
              )}
            </div>
          ) : preview && available ? (
            <div className="space-y-3 p-4 sm:p-6">
              <TextPreview path={path} />
            </div>
          ) : null}
        </div>
      </Overlay>
    </li>
  );
}

export function HubFeedbackFiles({
  files,
  path,
  disabled,
  onRemove,
}: {
  files: readonly HubFeedbackAttachmentResponse[];
  path: string;
  disabled: boolean;
  onRemove: (file: HubFeedbackAttachmentResponse) => void;
}) {
  if (!files.length) return null;
  return (
    <ul className="grid gap-2 sm:grid-cols-2" aria-label="反馈附件">
      {files.map((file) => (
        <FeedbackFile
          key={file.id}
          file={file}
          path={`${path}/attachments/${encodeURIComponent(file.id)}`}
          disabled={disabled}
          onRemove={onRemove}
        />
      ))}
    </ul>
  );
}
