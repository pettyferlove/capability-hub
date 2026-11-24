import type { ContentInspection } from '@capability-hub/domain/content';
import type { ScanInput } from '@capability-hub/application/ports';
import type { ContentFile } from '@capability-hub/domain/content';

/** 结构评测仅接受已固定的文件，接收扫描另可传入原始归档。 */
export type ScanRequest = ScanInput | { kind: 'structure'; files: ContentFile[] };

/** 扫描结果与归档来自同一次隔离解析。 */
export type IntakeScanResult = { inspected: ContentInspection; zip: Buffer };

/** 扫描进程间传递原始字节，保持二进制内容完整。 */
export type ScanResponse<T> =
  | { ok: true; result: T }
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
