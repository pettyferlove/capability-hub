import type { ContentInspection } from '@capability-hub/domain/content';
import type { ScanInput } from '@capability-hub/application/ports';
import { HubError } from '@capability-hub/domain/errors';
import { fork } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ScanResponse } from './scan-messages.js';
export async function scanIsolated(
  input: ScanInput,
): Promise<{ inspected: ContentInspection; zip: Buffer }> {
  const directory = await mkdtemp(join(tmpdir(), 'capability-scan-'));
  let exited: Promise<void> | undefined;
  try {
    return await new Promise((resolve, reject) => {
      const child = fork(
        fileURLToPath(
          new URL(
            import.meta.url.endsWith('.ts') ? './scan-process.ts' : './scan-process.js',
            import.meta.url,
          ),
        ),
        {
          cwd: directory,
          execArgv: [
            ...(import.meta.url.endsWith('.ts')
              ? ['--conditions=development', '--import', fileURLToPath(import.meta.resolve('tsx'))]
              : []),
            '--max-old-space-size=384',
          ],
          env: { PATH: process.env.PATH },
          stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
          serialization: 'advanced',
        },
      );
      exited = new Promise<void>((resolve) => child.once('close', () => resolve()));
      let done = false;
      const finish = (fn: () => void) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        child.kill('SIGKILL');
        fn();
      };
      const timer = setTimeout(
        () =>
          finish(() =>
            reject(new HubError(504, 'SCAN_TIMEOUT', '静态扫描超时，未产生通过结论', {}, true)),
          ),
        30000,
      );
      child.once('message', (result: ScanResponse) =>
        finish(() =>
          result.ok
            ? resolve({ inspected: result.inspected, zip: result.zip })
            : reject(
                new HubError(
                  result.error.status,
                  result.error.code,
                  result.error.message,
                  result.error.details,
                  result.error.retryable,
                ),
              ),
        ),
      );
      child.once('error', () =>
        finish(() => reject(new HubError(503, 'SCANNER_UNAVAILABLE', '扫描器不可用', {}, true))),
      );
      child.once('exit', (_code) => {
        if (!done)
          finish(() =>
            reject(new HubError(503, 'SCANNER_FAILED', '扫描器执行失败，未产生通过结论', {}, true)),
          );
      });
      child.send(input, (error) => {
        if (error)
          finish(() => reject(new HubError(503, 'SCANNER_UNAVAILABLE', '扫描器不可用', {}, true)));
      });
    });
  } finally {
    await exited;
    await rm(directory, { recursive: true, force: true });
  }
}
