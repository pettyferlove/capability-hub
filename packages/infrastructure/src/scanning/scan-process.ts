import { archive, inspect, unzip } from '../content.js';
import { HubError } from '@capability-hub/domain/errors';
import type { ScanInput } from '@capability-hub/application/ports';

process.once('message', (input: ScanInput) => {
  void scan(input);
});
async function scan(input: ScanInput): Promise<void> {
  try {
    const files =
      input.files ??
      (input.kind === 'skill'
        ? await unzip(input.bytes)
        : [{ path: 'server.json', bytes: input.bytes, executable: false }]);
    const inspected = inspect(input.kind, files, input.slug);
    const zip = await archive(inspected.files);
    process.send?.({ ok: true, inspected, zip }, () => process.disconnect());
  } catch (e) {
    const err =
      e instanceof HubError
        ? {
            status: e.status,
            code: e.code,
            message: e.message,
            details: e.details,
            retryable: e.retryable,
          }
        : {
            status: 500,
            code: 'SCANNER_FAILED',
            message: '扫描器处理失败，未产生检查结论',
            retryable: true,
          };
    process.send?.({ ok: false, error: err }, () => process.disconnect());
  }
}
