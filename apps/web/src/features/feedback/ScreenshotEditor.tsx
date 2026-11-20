import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { Button } from 'react-aria-components';
import { Overlay } from '../../shared/components/Overlay.js';
import { cn } from '../../shared/styles/cn.js';
import { btnPrimaryStyles, btnStyles, subtleStyles } from '../../shared/styles/recipes.js';
import {
  drawAnnotations,
  encodeAttachmentImage,
  fitImage,
  type AnnotationTool,
  type ImageAnnotation,
  type ImagePoint,
} from './attachment-images.js';

function point(event: PointerEvent<HTMLCanvasElement>): ImagePoint {
  const bounds = event.currentTarget.getBoundingClientRect();
  return {
    x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)),
    y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)),
  };
}

function annotationColors(canvas: HTMLCanvasElement) {
  const theme = getComputedStyle(canvas);
  return {
    ink: theme.getPropertyValue('--ink').trim(),
    paper: theme.getPropertyValue('--paper').trim(),
    brand: theme.getPropertyValue('--brand').trim(),
  };
}

const tools = [
  { id: 'outline', label: '框选' },
  { id: 'mask', label: '遮挡' },
] as const;

/** 编辑器只提交编码后的文件，预览与手势不改写源画布。 */
export function ScreenshotEditor({
  image,
  name,
  onCancel,
  onConfirm,
}: {
  image: HTMLCanvasElement;
  name: string;
  onCancel: () => void;
  onConfirm: (file: File) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const errorAlert = useRef<HTMLParagraphElement>(null);
  const pointer = useRef<{ id: number; tool: AnnotationTool; start: ImagePoint }>(null);
  const encoding = useRef(false);
  const [tool, setTool] = useState<AnnotationTool>('outline');
  const [marks, setMarks] = useState<ImageAnnotation[]>([]);
  const [draft, setDraft] = useState<ImageAnnotation>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const { width, height } = fitImage(image.width, image.height, 1440);

  useEffect(() => {
    const node = canvas.current;
    if (node)
      drawAnnotations(node, image, draft ? [...marks, draft] : marks, annotationColors(node));
  }, [image, marks, draft]);

  useEffect(() => {
    if (error && !busy) errorAlert.current?.focus();
  }, [error, busy]);

  function close() {
    if (!encoding.current) onCancel();
  }

  async function save(annotations: readonly ImageAnnotation[]) {
    const node = canvas.current;
    if (!node || encoding.current) return;
    encoding.current = true;
    setBusy(true);
    setError('');
    try {
      onConfirm(await encodeAttachmentImage(image, name, annotations, annotationColors(node)));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '无法保存图片，请重试。');
    } finally {
      encoding.current = false;
      setBusy(false);
    }
  }

  function endPointer(event: PointerEvent<HTMLCanvasElement>, commit: boolean) {
    const active = pointer.current;
    if (!active || active.id !== event.pointerId) return;
    pointer.current = null;
    setDraft(undefined);
    if (commit && !encoding.current) {
      const end = point(event);
      if (
        Math.abs(active.start.x - end.x) * image.width >= 1 &&
        Math.abs(active.start.y - end.y) * image.height >= 1
      ) {
        setMarks((current) => [...current, { tool: active.tool, start: active.start, end }]);
      }
    }
  }

  return (
    <Overlay open label="标注图片" variant="showcase" size="workspace" onClose={close}>
      <div data-overlay-child="true" className="flex h-full min-w-0 flex-col gap-3 p-3 sm:p-4">
        <header className="flex shrink-0 flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 flex-1 basis-40">
            <h2 className="text-section">标注图片</h2>
            <p className={cn(subtleStyles, 'truncate')} title={name}>
              {name}
            </p>
          </div>
          <div role="group" aria-label="标注工具" className="flex flex-wrap gap-2">
            {tools.map(({ id, label }) => (
              <Button
                key={id}
                className={cn(btnStyles, tool === id && 'border-brand bg-brand-soft text-brand')}
                aria-pressed={tool === id}
                isDisabled={busy}
                onPress={() => setTool(id)}
              >
                {label}
              </Button>
            ))}
            <Button
              className={btnStyles}
              isDisabled={busy || !marks.length}
              onPress={() => setMarks((current) => current.slice(0, -1))}
            >
              撤销
            </Button>
            <Button
              className={btnStyles}
              isDisabled={busy || !marks.length}
              onPress={() => setMarks([])}
            >
              重置
            </Button>
          </div>
        </header>
        <div className="flex min-h-28 flex-1 items-center justify-center overflow-hidden rounded-lg border border-line bg-page [container-type:size]">
          <canvas
            ref={canvas}
            role="img"
            aria-label="图片标注预览"
            className="block h-auto touch-none cursor-crosshair"
            style={{ width: `min(100%, ${width}px, ${(width / height) * 100}cqh)` }}
            width={width}
            height={height}
            onPointerDown={(event) => {
              if (encoding.current || pointer.current || event.button !== 0) return;
              const start = point(event);
              pointer.current = { id: event.pointerId, tool, start };
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => {
              const active = pointer.current;
              if (!encoding.current && active?.id === event.pointerId) {
                setDraft({ tool: active.tool, start: active.start, end: point(event) });
              }
            }}
            onPointerUp={(event) => endPointer(event, true)}
            onPointerCancel={(event) => endPointer(event, false)}
            onLostPointerCapture={(event) => endPointer(event, false)}
          />
        </div>
        <footer className="flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <div className="min-w-0 flex-1 basis-64">
            <p className={subtleStyles}>在图片上拖动标注。遮挡会覆盖原图像素，完成后不可撤销。</p>
            {busy && (
              <p role="status" className={subtleStyles}>
                正在保存图片…
              </p>
            )}
            {error && (
              <p ref={errorAlert} role="alert" tabIndex={-1} className="text-label text-danger">
                {error}
              </p>
            )}
          </div>
          <div className="ml-auto flex flex-wrap justify-end gap-2">
            <Button className={btnStyles} isDisabled={busy} onPress={close}>
              取消
            </Button>
            <Button
              className={cn(btnStyles, btnPrimaryStyles)}
              isDisabled={busy}
              onPress={() => void save(marks)}
            >
              {marks.length ? '完成' : '跳过标注'}
            </Button>
          </div>
        </footer>
      </div>
    </Overlay>
  );
}
