import { archive, inspect, unzip } from '../content.js';
import { HubError } from '@capability-hub/domain/errors';
import { analyzeSkillStructure } from '../content/skill-static-analyzer.js';
import type { ScanRequest } from './scan-messages.js';

process.once('message', (input: ScanRequest) => {
  void scan(input);
});
async function scan(input: ScanRequest): Promise<void> {
  try {
    if (input.kind === 'structure') {
      const result = analyzeSkillStructure(input.files);
      process.send?.({ ok: true, result }, () => process.disconnect());
      return;
    }
    const files =
      input.files ??
      (input.kind === 'skill'
        ? await unzip(input.bytes)
        : [{ path: 'server.json', bytes: input.bytes, executable: false }]);
    const inspected = inspect(input.kind, files, input.slug);
    const zip = await archive(inspected.files);
    process.send?.({ ok: true, result: { inspected, zip } }, () => process.disconnect());
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
