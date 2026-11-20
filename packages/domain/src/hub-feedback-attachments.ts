import { fail } from './errors.js';
import type { HubFeedbackAttachmentKind, HubFeedbackMediaType } from './models/hub-feedback.js';

const mib = 1024 * 1024;
const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const jpegFrames = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
]);
const decoder = new TextDecoder('utf-8', { fatal: true });

type ImageHeader = {
  media_type: Extract<HubFeedbackMediaType, `image/${string}`>;
  width: number;
  height: number;
};

function imageHeader(bytes: Buffer): ImageHeader | undefined {
  if (
    bytes.length >= 33 &&
    bytes.compare(pngSignature, 0, 8, 0, 8) === 0 &&
    bytes.readUInt32BE(8) === 13 &&
    bytes.toString('latin1', 12, 16) === 'IHDR'
  ) {
    return {
      media_type: 'image/png',
      width: bytes.readUInt32BE(16),
      height: bytes.readUInt32BE(20),
    };
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 3 < bytes.length && bytes[offset] === 0xff) {
      while (bytes[offset] === 0xff) offset++;
      const marker = bytes[offset++];
      if (marker === 0xd9 || marker === 0xda || offset + 2 > bytes.length) break;
      const length = bytes.readUInt16BE(offset);
      if (length < 2 || offset + length > bytes.length) break;
      if (jpegFrames.has(marker) && length >= 8)
        return {
          media_type: 'image/jpeg',
          height: bytes.readUInt16BE(offset + 3),
          width: bytes.readUInt16BE(offset + 5),
        };
      offset += length;
    }
  }
  if (
    bytes.length >= 25 &&
    bytes.toString('latin1', 0, 4) === 'RIFF' &&
    bytes.toString('latin1', 8, 12) === 'WEBP' &&
    bytes.readUInt32LE(4) + 8 === bytes.length
  ) {
    const chunk = bytes.toString('latin1', 12, 16);
    const length = bytes.readUInt32LE(16);
    if (length + 20 <= bytes.length) {
      if (chunk === 'VP8X' && length === 10)
        return {
          media_type: 'image/webp',
          width: bytes.readUIntLE(24, 3) + 1,
          height: bytes.readUIntLE(27, 3) + 1,
        };
      if (chunk === 'VP8L' && length >= 5 && bytes[20] === 0x2f) {
        const dimensions = bytes.readUInt32LE(21);
        return {
          media_type: 'image/webp',
          width: (dimensions & 0x3fff) + 1,
          height: ((dimensions >>> 14) & 0x3fff) + 1,
        };
      }
      if (chunk === 'VP8 ' && length >= 10 && bytes.readUIntBE(23, 3) === 0x9d012a)
        return {
          media_type: 'image/webp',
          width: bytes.readUInt16LE(26) & 0x3fff,
          height: bytes.readUInt16LE(28) & 0x3fff,
        };
    }
  }
}

function invalidType(): never {
  return fail(
    422,
    'HUB_FEEDBACK_ATTACHMENT_TYPE',
    '只支持尺寸合规的 PNG、JPEG、WebP 或 UTF-8 文本与 JSON',
  );
}

/** 附件名称只用于展示，不保留输入路径和控制字符。 */
export function hubFeedbackAttachmentName(input: string): string {
  const name = input
    .slice(Math.max(input.lastIndexOf('/'), input.lastIndexOf('\\')) + 1)
    .replace(/[\p{Cc}\p{Cf}]/gu, '')
    .trim()
    .slice(0, 120)
    .replace(/[\uD800-\uDFFF]/gu, '');
  return name && name !== '.' && name !== '..' ? name : '附件';
}

/** 图片只读尺寸头，不解码像素；文本原样交给调用方扫描，不进入元数据。 */
export function inspectHubFeedbackAttachment(
  bytes: Buffer,
  kind?: HubFeedbackAttachmentKind,
): {
  kind: HubFeedbackAttachmentKind;
  media_type: HubFeedbackMediaType;
  width: number | null;
  height: number | null;
  content?: string;
} {
  if (!bytes.length) invalidType();
  if (bytes.length > 5 * mib) fail(413, 'UPLOAD_LIMIT', '附件不能超过 5 MiB');
  const image = imageHeader(bytes);
  if (image) {
    const { width, height } = image;
    if (
      (kind !== undefined && kind !== 'image' && kind !== 'screenshot') ||
      width < 1 ||
      height < 1 ||
      width > 8192 ||
      height > 8192 ||
      width * height > 40_000_000
    )
      invalidType();
    return { kind: kind ?? 'image', ...image };
  }
  if (kind === 'image' || kind === 'screenshot') invalidType();
  if (bytes.length > mib) fail(413, 'UPLOAD_LIMIT', '文本附件不能超过 1 MiB');
  let content: string;
  try {
    content = decoder.decode(bytes);
  } catch {
    return invalidType();
  }
  if (
    content.includes('\0') ||
    /^GIF8[79]a/.test(content) ||
    /<(?:[\w.-]+:)?svg(?:\s|[/>])/i.test(content)
  )
    invalidType();
  let json = false;
  try {
    JSON.parse(content);
    json = true;
  } catch {
    // 非 JSON 的 UTF-8 内容仍可作为纯文本下载。
  }
  return {
    kind: json ? 'json' : 'text',
    media_type: json ? 'application/json' : 'text/plain',
    width: null,
    height: null,
    content,
  };
}
