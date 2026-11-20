import type { HubFeedbackAttachmentKind } from '@capability-hub/contracts';
import { pageHref } from '../../shared/navigation/history-route.js';

/** 上传原始文本或经画布编码后的图片；预览不依赖临时 URL。 */
export interface HubFeedbackLocalFile {
  file: File;
  kind: HubFeedbackAttachmentKind;
  name: string;
}

/** `part` 与 multipart 文件按同一顺序发送。 */
export function hubFeedbackForm(
  metadata: object,
  files: readonly HubFeedbackLocalFile[],
): FormData {
  const form = new FormData();
  form.set(
    'metadata',
    JSON.stringify({
      ...metadata,
      files: files.map(({ kind, name }, part) => ({ part, kind, name })),
    }),
  );
  for (const { file, name } of files) form.append('files', file, name);
  return form;
}

/** 账号页内的本人反馈或指定详情链接。 */
export function myHubFeedbackHref(id?: string): string {
  return pageHref('account', { tab: 'feedback', feedback: id });
}
