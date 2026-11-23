import { sha256 } from '@capability-hub/domain/canonical';
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

/** 摘要用于绑定幂等请求，此时对象不一定已经写入。 */
export type HubFeedbackCheckedUpload = Pick<
  HubFeedbackAttachmentRecord,
  'kind' | 'name' | 'media_type' | 'size' | 'width' | 'height'
> & { sha256: string };

function inspectUpload(
  { bytes, kind, name: input }: HubFeedbackUpload,
  part: number,
  scan: HubFeedbackSecretScanner,
): HubFeedbackCheckedUpload {
  const name = hubFeedbackAttachmentName(input);
  scanHubFeedbackText(scan, name, { attachment: part });
  const { content, ...attachment } = inspectHubFeedbackAttachment(bytes, kind);
  if (content !== undefined) scanHubFeedbackText(scan, content, { attachment: part });
  return { ...attachment, name, size: bytes.length, sha256: sha256(bytes) };
}

/** 格式和凭据不依赖数据库状态，先检查整批附件再写对象。 */
export function checkHubFeedbackUploads(
  scan: HubFeedbackSecretScanner,
  uploads: readonly HubFeedbackUpload[],
): HubFeedbackCheckedUpload[] {
  if (
    uploads.length > 5 ||
    uploads.some((file) => file.bytes.length > 5 * mib) ||
    uploads.reduce((sum, file) => sum + file.bytes.length, 0) > 12 * mib
  )
    fail(413, 'UPLOAD_LIMIT', '单次最多上传 5 个附件，合计不得超过 12 MiB');
  return uploads.map((file, part) => inspectUpload(file, part, scan));
}

/** 在准入与提交事务之间写入并核对摘要；并发拒绝后的无引用对象由停机维护回收。 */
export async function persistHubFeedbackUploads(
  blobs: BlobStorage,
  uploads: readonly HubFeedbackUpload[],
  checked: readonly HubFeedbackCheckedUpload[],
) {
  for (const [index, { bytes }] of uploads.entries()) {
    if ((await blobs.put(bytes)) !== checked[index].sha256)
      fail(503, 'BLOB_CORRUPT', '附件完整性校验失败');
  }
}
