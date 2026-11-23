import { hubFeedbackLimits } from '@capability-hub/contracts';

/** 描边保留原图，遮挡则覆盖选区的像素。 */
export type AnnotationTool = 'outline' | 'mask';

/** 以图片左上角为原点，每个轴独立归一化到 0–1。 */
export type ImagePoint = { x: number; y: number };

/** 保留拖动的起止点，允许从任意方向划选。 */
export type ImageAnnotation = { tool: AnnotationTool; start: ImagePoint; end: ImagePoint };

/** 与上传接口使用相同的文件名清理规则。 */
export function cleanAttachmentName(input: string, fallback = '附件'): string {
  const name = input
    .slice(Math.max(input.lastIndexOf('/'), input.lastIndexOf('\\')) + 1)
    .replace(/[\p{Cc}\p{Cf}]/gu, '')
    .trim()
    .slice(0, 120)
    .replace(/[\uD800-\uDFFF]/gu, '');
  return name && name !== '.' && name !== '..' ? name : fallback;
}

/** 按最长边等比缩小，不放大小图。 */
export function fitImage(width: number, height: number, maxEdge: number) {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function imageContext(canvas: HTMLCanvasElement) {
  const context = canvas.getContext('2d');
  if (!context) throw new Error('浏览器无法绘制图片，请换用支持 Canvas 的浏览器。');
  return context;
}

function isSupportedImage(bytes: Uint8Array): boolean {
  return (
    (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) ||
    [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte) ||
    (String.fromCharCode(...bytes.subarray(0, 4)) === 'RIFF' &&
      String.fromCharCode(...bytes.subarray(8, 12)) === 'WEBP')
  );
}

/** 检查实际图片签名，不信任文件扩展名或声明的 MIME 类型。 */
export async function decodeAttachmentImage(file: Blob): Promise<ImageBitmap> {
  if (typeof createImageBitmap !== 'function') {
    throw new Error('此浏览器无法处理图片。请换用其他浏览器，或添加文本附件。');
  }
  if (!isSupportedImage(new Uint8Array(await file.slice(0, 12).arrayBuffer()))) {
    throw new Error('图片只支持 PNG、JPEG 或 WebP。');
  }
  try {
    return await createImageBitmap(file);
  } catch {
    throw new Error('无法读取这张图片，请换一张。');
  }
}

/** 复制到编辑用画布；调用方仍负责关闭输入位图。 */
export function editorImage(bitmap: ImageBitmap): HTMLCanvasElement {
  if (!bitmap.width || !bitmap.height) throw new Error('图片没有可用的画面。');
  if (bitmap.width > 8192 || bitmap.height > 8192 || bitmap.width * bitmap.height > 40_000_000) {
    throw new Error('图片边长不能超过 8192 像素，且总像素不能超过 4000 万。');
  }
  const canvas = document.createElement('canvas');
  const { width, height } = fitImage(bitmap.width, bitmap.height, 2560);
  canvas.width = width;
  canvas.height = height;
  imageContext(canvas).drawImage(bitmap, 0, 0, width, height);
  return canvas;
}

type AnnotationColors = { ink: string; paper: string; brand: string };
const mosaicShades = [0.28, 0.16, 0.34, 0.2, 0.4, 0.25, 0.36, 0.24, 0.13];
const mosaicPatterns = new WeakMap<
  CanvasRenderingContext2D,
  { cell: number; ink: string; paper: string; fill: CanvasPattern }
>();

function mosaicFill(
  context: CanvasRenderingContext2D,
  { ink, paper }: AnnotationColors,
  cell: number,
): CanvasPattern | string {
  const cached = mosaicPatterns.get(context);
  if (cached?.cell === cell && cached.ink === ink && cached.paper === paper) return cached.fill;
  const tile = document.createElement('canvas');
  tile.width = tile.height = 3 * cell;
  // 色阶只混合主题色，图块没有透明通道，也不读取底图像素。
  const tileContext = tile.getContext('2d', { alpha: false });
  if (!tileContext) return ink;
  tileContext.fillStyle = paper;
  tileContext.fillRect(0, 0, tile.width, tile.height);
  tileContext.fillStyle = ink;
  for (const [index, shade] of mosaicShades.entries()) {
    tileContext.globalAlpha = shade;
    tileContext.fillRect((index % 3) * cell, Math.floor(index / 3) * cell, cell, cell);
  }
  const fill = context.createPattern(tile, 'repeat');
  if (!fill) return ink;
  mosaicPatterns.set(context, { cell, ink, paper, fill });
  return fill;
}

/** 以目标画布的像素坐标栅格化同一组标注。 */
export function drawAnnotations(
  canvas: HTMLCanvasElement,
  source: CanvasImageSource,
  annotations: readonly ImageAnnotation[],
  colors: AnnotationColors,
): void {
  const context = imageContext(canvas);
  const { width, height } = canvas;
  context.clearRect(0, 0, width, height);
  context.drawImage(source, 0, 0, width, height);
  let maskFill: CanvasPattern | string | undefined;
  for (const { tool, start, end } of annotations) {
    const left = Math.floor(Math.min(start.x, end.x) * width);
    const top = Math.floor(Math.min(start.y, end.y) * height);
    const right = Math.ceil(Math.max(start.x, end.x) * width);
    const bottom = Math.ceil(Math.max(start.y, end.y) * height);
    if (tool === 'mask') {
      maskFill ??= mosaicFill(
        context,
        colors,
        Math.max(3, Math.round(Math.max(width, height) / 120)),
      );
      context.fillStyle = maskFill;
      context.fillRect(left, top, right - left, bottom - top);
    } else {
      context.lineWidth = Math.max(2, Math.round(Math.max(width, height) / 360));
      context.strokeStyle = colors.brand;
      context.strokeRect(left, top, right - left, bottom - top);
    }
  }
}

function canvasBlob(canvas: HTMLCanvasElement, type: string, quality?: number) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
}

/** 只返回重新编码的图片，不携带原始文件或标注图层。 */
export async function encodeAttachmentImage(
  source: HTMLCanvasElement,
  name: string,
  annotations: readonly ImageAnnotation[],
  colors: AnnotationColors,
): Promise<File> {
  const canvas = annotations.length ? document.createElement('canvas') : source;
  try {
    if (canvas !== source) {
      canvas.width = source.width;
      canvas.height = source.height;
      drawAnnotations(canvas, source, annotations, colors);
    }
    const webp = await canvasBlob(canvas, 'image/webp', 0.9);
    const blob =
      webp?.type === 'image/webp' || webp?.type === 'image/png'
        ? webp
        : await canvasBlob(canvas, 'image/png');
    if (!blob?.size) throw new Error('无法保存图片，请重试。');
    if (blob.size > hubFeedbackLimits.imageBytes) {
      throw new Error('处理后的图片超过 5 MiB，请改用更小的图片。');
    }
    const extension = blob.type === 'image/webp' ? '.webp' : '.png';
    const stem = cleanAttachmentName(name.replace(/\.[^.]+$/, ''), '图片');
    const stemLimit = 120 - extension.length;
    const fileName = `${stem.slice(0, stemLimit).replace(/[\uD800-\uDFFF]/gu, '')}${extension}`;
    return new File([blob], fileName, { type: blob.type });
  } finally {
    if (canvas !== source) canvas.width = 0;
  }
}
