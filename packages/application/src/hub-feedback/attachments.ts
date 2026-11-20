import { fail } from '@capability-hub/domain/errors';
import type {
  HubFeedbackAttachmentRecord,
  HubFeedbackMediaType,
} from '@capability-hub/domain/models';
import type { BlobStorage, HubFeedbackSecretScanner } from '../ports/index.js';
import type { HubFeedbackUpload } from './commands.js';

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

function textContent(bytes: Buffer): string {
  try {
    return decoder.decode(bytes);
  } catch {
    return invalidType();
  }
}

function invalidType(): never {
  return fail(
    422,
    'HUB_FEEDBACK_ATTACHMENT_TYPE',
    '只支持尺寸合规的 PNG、JPEG、WebP 或 UTF-8 文本与 JSON',
  );
}

function displayName(input: string): string {
  const name = input
    .slice(Math.max(input.lastIndexOf('/'), input.lastIndexOf('\\')) + 1)
    .replace(/[\p{Cc}\p{Cf}]/gu, '')
    .trim()
    .slice(0, 120)
    .replace(/[\uD800-\uDFFF]/gu, '');
  return name && name !== '.' && name !== '..' ? name : '附件';
}

export function scanHubFeedbackText(
  scan: HubFeedbackSecretScanner,
  text: string,
  location: { field: string } | { attachment: number },
): void {
  const lines = new Set<number>();
  for (const finding of scan(text)) {
    lines.add(finding.line);
    if (lines.size === 20) break;
  }
  if (lines.size)
    fail(422, 'HUB_FEEDBACK_SECRET_DETECTED', '内容可能包含凭据，请移除后重试', {
      ...location,
      lines: [...lines].sort((a, b) => a - b),
    });
}

export type HubFeedbackStoredUpload = Pick<
  HubFeedbackAttachmentRecord,
  'kind' | 'name' | 'media_type' | 'size' | 'width' | 'height'
> & { sha256: string };

type Inspected = Omit<HubFeedbackStoredUpload, 'sha256'>;

function inspectUpload(
  { bytes, kind, name: input }: HubFeedbackUpload,
  part: number,
  scan: HubFeedbackSecretScanner,
): Inspected {
  const name = displayName(input);
  const size = bytes.length;
  scanHubFeedbackText(scan, name, { attachment: part });
  if (!size) invalidType();
  const image = imageHeader(bytes);
  if (image) {
    const { width, height } = image;
    if (
      (kind !== 'image' && kind !== 'screenshot') ||
      width < 1 ||
      height < 1 ||
      width > 8192 ||
      height > 8192 ||
      width * height > 40_000_000
    )
      invalidType();
    return { kind, name, size, ...image };
  }
  if (kind === 'image' || kind === 'screenshot') invalidType();
  if (size > mib) fail(413, 'UPLOAD_LIMIT', '文本附件不能超过 1 MiB');
  const content = textContent(bytes);
  if (
    content.includes('\0') ||
    /^GIF8[79]a/.test(content) ||
    /<(?:[\w.-]+:)?svg(?:\s|[/>])/i.test(content)
  )
    invalidType();
  scanHubFeedbackText(scan, content, { attachment: part });
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
    name,
    size,
    width: null,
    height: null,
  };
}

export async function storeHubFeedbackUploads(
  blobs: BlobStorage,
  scan: HubFeedbackSecretScanner,
  uploads: readonly HubFeedbackUpload[],
): Promise<HubFeedbackStoredUpload[]> {
  if (
    uploads.length > 5 ||
    uploads.some((file) => file.bytes.length > 5 * mib) ||
    uploads.reduce((sum, file) => sum + file.bytes.length, 0) > 12 * mib
  )
    fail(413, 'UPLOAD_LIMIT', '单次最多上传 5 个附件，合计不得超过 12 MiB');
  const checked = uploads.map((file, part) => inspectUpload(file, part, scan));
  const result: HubFeedbackStoredUpload[] = [];
  for (const [part, upload] of uploads.entries()) {
    result.push({ ...checked[part], sha256: await blobs.put(upload.bytes) });
  }
  return result;
}
