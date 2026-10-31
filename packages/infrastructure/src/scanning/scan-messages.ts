import type { ContentInspection } from '@capability-hub/domain/content';
import type { Buffer } from 'node:buffer';
/** 扫描进程间传递原始字节，保持二进制内容完整。 */
export type ScanResponse =
  | { ok: true; inspected: ContentInspection; zip: Buffer }
  | {
      ok: false;
      error: {
        status: number;
        code: string;
        message: string;
        details?: unknown;
        retryable: boolean;
      };
    };
