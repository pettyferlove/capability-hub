import { hubFeedbackLimits } from '@capability-hub/contracts';
import { useEffect, useEffectEvent, useId, useLayoutEffect, useRef, useState } from 'react';
import { Button } from 'react-aria-components';
import { bytesLabel } from '../../shared/format/labels.js';
import { cn } from '../../shared/styles/cn.js';
import { btnStyles, subtleStyles, textBtnStyles } from '../../shared/styles/recipes.js';
import {
  cleanAttachmentName,
  decodeAttachmentImage,
  editorImage,
  fitImage,
} from './attachment-images.js';
import type { HubFeedbackLocalFile } from './hub-feedback-api.js';
import { ScreenshotEditor } from './ScreenshotEditor.js';

const accept = 'image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp,.txt,.log,.md,.json';
const imageTypes = ['image/png', 'image/jpeg', 'image/webp'];
const decoder = new TextDecoder('utf-8', { fatal: true });

type QueueEntry = {
  id: number;
  file: File;
  name: string;
  image: boolean;
  replace?: HubFeedbackLocalFile;
};

function classify(file: File): 'image' | 'text' | undefined {
  if (imageTypes.includes(file.type) || /\.(png|jpe?g|webp)$/i.test(file.name)) return 'image';
  if (!file.type.startsWith('image/') && /\.(txt|log|md|json)$/i.test(file.name)) return 'text';
  return undefined;
}

async function checkText({ file, name }: QueueEntry): Promise<HubFeedbackLocalFile> {
  let content: string;
  try {
    content = decoder.decode(await file.arrayBuffer());
  } catch {
    throw new Error('文本附件必须使用 UTF-8 编码。');
  }
  if (
    content.includes('\0') ||
    /^GIF8[79]a/.test(content) ||
    /<(?:[\w.-]+:)?svg(?:\s|[/>])/i.test(content)
  ) {
    throw new Error('请选择 UTF-8 文本或 JSON。');
  }
  try {
    JSON.parse(content);
    return { kind: 'json', file, name };
  } catch {
    return { kind: 'text', file, name };
  }
}

function Thumbnail({ file }: { file: File }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let canceled = false;
    const node = canvas.current;
    if (!node) return;
    void (async () => {
      try {
        const bitmap = await decodeAttachmentImage(file);
        try {
          if (canceled) return;
          const { width, height } = fitImage(bitmap.width, bitmap.height, 160);
          node.width = width;
          node.height = height;
          node.getContext('2d')?.drawImage(bitmap, 0, 0, width, height);
        } finally {
          bitmap.close();
        }
      } catch {
        // 附件名称和操作始终可用，缩略图不影响已处理的图片。
      }
    })();
    return () => {
      canceled = true;
      node.width = 0;
    };
  }, [file]);
  return <canvas ref={canvas} aria-hidden="true" className="max-h-12 max-w-16 object-contain" />;
}

/** 已处理的文件交给表单；原图仅在待处理队列和编辑器中保留。 */
export function AttachmentTray({
  files,
  onChange,
  enabled = true,
  disabled = false,
  onProcessingChange,
}: {
  files: HubFeedbackLocalFile[];
  onChange: (files: HubFeedbackLocalFile[]) => void;
  enabled?: boolean;
  disabled?: boolean;
  onProcessingChange?: (processing: boolean) => void;
}) {
  const labelId = useId();
  const root = useRef<HTMLElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const sequence = useRef(0);
  const [queue, setQueue] = useState<QueueEntry[]>([]);
  const [decoded, setDecoded] = useState<{ id: number; image: HTMLCanvasElement }>();
  const [over, setOver] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const current = queue[0];
  const active = enabled && !disabled;
  const processing = active && Boolean(current);
  const live = useRef({ files, onChange, active, current });

  useLayoutEffect(() => {
    live.current = { files, onChange, active, current };
    return () => {
      live.current.active = false;
    };
  }, [files, onChange, active, current]);

  useLayoutEffect(() => {
    onProcessingChange?.(processing);
  }, [onProcessingChange, processing]);

  const resetProcessing = useEffectEvent(() => onProcessingChange?.(false));
  useEffect(() => () => resetProcessing(), []);

  function advance(entry: QueueEntry) {
    setQueue((pending) => pending.filter(({ id }) => id !== entry.id));
    setDecoded(undefined);
  }

  function attach(entry: QueueEntry, attachment: HubFeedbackLocalFile) {
    const latest = live.current;
    if (!latest.active || latest.current !== entry) return;
    if (entry.replace && !latest.files.includes(entry.replace)) {
      advance(entry);
      return;
    }
    const next = entry.replace
      ? latest.files.map((file) => (file === entry.replace ? attachment : file))
      : [...latest.files, attachment];
    if (next.length > hubFeedbackLimits.uploadFiles) throw new Error('单次最多添加 5 个附件。');
    if (next.reduce((total, item) => total + item.file.size, 0) > hubFeedbackLimits.uploadBytes) {
      throw new Error('附件合计不能超过 12 MiB，请先移除其他附件。');
    }
    live.current = { ...latest, files: next };
    latest.onChange(next);
    advance(entry);
  }

  const finishText = useEffectEvent(attach);
  useEffect(() => {
    if (!active) {
      setQueue((pending) => (pending.length ? [] : pending));
      setDecoded(undefined);
      return;
    }
    if (!current) return;
    let canceled = false;
    let source: HTMLCanvasElement | undefined;
    void (async () => {
      try {
        if (!current.image) {
          const attachment = await checkText(current);
          if (!canceled) finishText(current, attachment);
          return;
        }
        const bitmap = await decodeAttachmentImage(current.file);
        try {
          if (canceled) return;
          source = editorImage(bitmap);
          setDecoded({ id: current.id, image: source });
        } finally {
          bitmap.close();
        }
      } catch (error) {
        if (canceled) return;
        const message = error instanceof Error ? error.message : '无法读取附件，请重试。';
        setErrors((previous) => [...previous, `${current.name}：${message}`]);
        advance(current);
      }
    })();
    return () => {
      canceled = true;
      if (source) source.width = 0;
    };
  }, [active, current]);

  function enqueue(selected: readonly File[]) {
    if (!active || !selected.length) return false;
    const pending: QueueEntry[] = [];
    const rejected: string[] = [];
    const available =
      hubFeedbackLimits.uploadFiles -
      live.current.files.length -
      queue.filter((entry) => !entry.replace).length;
    for (const file of selected) {
      if (pending.length >= available) {
        rejected.push('单次最多添加 5 个附件。');
        break;
      }
      const type = classify(file);
      const name = cleanAttachmentName(file.name, type === 'image' ? '图片' : '附件');
      if (!type || !file.size) {
        rejected.push(`${name}：请选择非空的 PNG、JPEG、WebP 或 UTF-8 文本与 JSON。`);
        continue;
      }
      const maxSize = type === 'image' ? hubFeedbackLimits.imageBytes : hubFeedbackLimits.textBytes;
      if (file.size > maxSize) {
        const limit = type === 'image' ? '图片不能超过 5 MiB。' : '文本不能超过 1 MiB。';
        rejected.push(`${name}：${limit}`);
        continue;
      }
      pending.push({ id: ++sequence.current, file, name, image: type === 'image' });
    }
    setErrors(rejected);
    if (pending.length) setQueue((previous) => [...previous, ...pending]);
    return Boolean(pending.length);
  }

  const pasteImages = useEffectEvent((event: ClipboardEvent) => {
    if (event.defaultPrevented || !event.clipboardData || !root.current) return;
    const target = event.target instanceof Element ? event.target : document.activeElement;
    if (target?.closest('[role="dialog"]') !== root.current.closest('[role="dialog"]')) return;
    const pasted = Array.from(event.clipboardData.items).flatMap((item) => {
      if (item.kind !== 'file') return [];
      const file = item.getAsFile();
      return file && classify(file) === 'image' ? [file] : [];
    });
    if (enqueue(pasted)) event.preventDefault();
  });

  useEffect(() => {
    if (!active) return;
    const onPaste = (event: ClipboardEvent) => pasteImages(event);
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [active]);

  function remove(file: HubFeedbackLocalFile) {
    const latest = live.current;
    const next = latest.files.filter((item) => item !== file);
    live.current = { ...latest, files: next };
    latest.onChange(next);
  }

  const editor = active && current && decoded?.id === current.id ? decoded.image : undefined;
  return (
    <section ref={root} aria-labelledby={labelId} className="grid min-w-0 gap-2">
      <h3 id={labelId} className="text-body font-semibold">
        截图与附件
      </h3>
      <div
        className={cn(
          'grid justify-items-start gap-2 rounded-lg border border-dashed border-line p-3',
          over && active && 'border-brand bg-brand-soft',
        )}
        onDragOver={(event) => {
          if (!Array.from(event.dataTransfer.types).includes('Files')) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = active ? 'copy' : 'none';
          if (active) setOver(true);
        }}
        onDragLeave={(event) => {
          if (
            !(event.relatedTarget instanceof Node) ||
            !event.currentTarget.contains(event.relatedTarget)
          )
            setOver(false);
        }}
        onDrop={(event) => {
          if (!event.dataTransfer.files.length) return;
          event.preventDefault();
          setOver(false);
          enqueue(Array.from(event.dataTransfer.files));
        }}
      >
        <input
          ref={input}
          type="file"
          hidden
          multiple
          accept={accept}
          aria-label="选择图片或附件"
          disabled={!active}
          onChange={(event) => {
            enqueue(Array.from(event.currentTarget.files ?? []));
            event.currentTarget.value = '';
          }}
        />
        <Button className={btnStyles} isDisabled={!active} onPress={() => input.current?.click()}>
          添加图片或文件
        </Button>
        <p className={subtleStyles}>
          可粘贴截图或拖入文件。最多 5 个、共 12 MiB；单张图片 5 MiB、文本 1 MiB。
        </p>
      </div>
      {processing && !editor && (
        <p role="status" className={subtleStyles}>
          正在读取附件…
        </p>
      )}
      {errors.length > 0 && (
        <ul role="alert" className="grid gap-1 break-all text-label text-danger">
          {errors.map((error, index) => (
            <li key={`${index}-${error}`}>{error}</li>
          ))}
        </ul>
      )}
      {files.length > 0 && (
        <ul className="grid gap-1.5">
          {files.map((file, index) => {
            const image = file.kind === 'image' || file.kind === 'screenshot';
            return (
              <li
                key={`${index}-${file.name}`}
                className="flex min-w-0 flex-wrap items-center gap-2 rounded-lg border border-line bg-paper px-3 py-2"
              >
                {image && <Thumbnail file={file.file} />}
                <div className="min-w-0 grow basis-28">
                  <p className="break-all text-label font-medium">{file.name}</p>
                  <p className={subtleStyles}>{bytesLabel(file.file.size)}</p>
                </div>
                {image && (
                  <Button
                    aria-label={`标注 ${file.name}`}
                    className={textBtnStyles}
                    isDisabled={!active || processing}
                    onPress={() => {
                      const entry = {
                        id: ++sequence.current,
                        file: file.file,
                        name: file.name,
                        image: true,
                        replace: file,
                      };
                      setQueue((pending) => [...pending, entry]);
                    }}
                  >
                    标注
                  </Button>
                )}
                <Button
                  aria-label={`移除 ${file.name}`}
                  className={textBtnStyles}
                  isDisabled={!active}
                  onPress={() => remove(file)}
                >
                  移除
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      {editor && current && (
        <ScreenshotEditor
          key={current.id}
          image={editor}
          name={current.name}
          onCancel={() => advance(current)}
          onConfirm={(file) =>
            attach(current, { file, name: file.name, kind: current.replace?.kind ?? 'image' })
          }
        />
      )}
    </section>
  );
}
