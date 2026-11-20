import { fail } from '@capability-hub/domain/errors';
import {
  hubFeedbackAttachmentName,
  inspectHubFeedbackAttachment,
} from '@capability-hub/domain/content';
import type { HubFeedbackAttachmentRecord } from '@capability-hub/domain/models';
import type { BlobStorage, HubFeedbackSecretScanner } from '../ports/index.js';
import type { HubFeedbackUpload } from './commands.js';

const mib = 1024 * 1024;

/** 只返回字段或附件序号和匹配行号，不保留凭据原文。 */
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
  const name = hubFeedbackAttachmentName(input);
  scanHubFeedbackText(scan, name, { attachment: part });
  const { content, ...attachment } = inspectHubFeedbackAttachment(bytes, kind);
  if (content !== undefined) scanHubFeedbackText(scan, content, { attachment: part });
  return { ...attachment, name, size: bytes.length };
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
