import type { EvaluationDimensionResult } from '@capability-hub/domain/models';
import type { SkillStaticAnalyzer, ScanInput } from '@capability-hub/application/ports';
import { HubError } from '@capability-hub/domain/errors';
import { fork } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ScanResponse, ScanRequest, IntakeScanResult } from './scan-messages.js';

/**
 * 在隔离子进程里执行接收扫描或结构评测，宿主进程不直接解析不可信上传内容。
 *
 * 隔离手段：`fork` 的子进程堆上限 384 MiB、`cwd` 指向新建临时目录、环境变量只剩 `PATH`、
 * 三个标准流全部丢弃，只走 IPC（advanced 序列化以传 Buffer）。输入经 IPC 传入，
 * 接收返回审查结果与 ZIP，评测只返回维度结果。单次 30 秒超时（504 `SCAN_TIMEOUT`，可重试）；子进程提前退出或
 * IPC 失败按 503 `SCANNER_FAILED` / `SCANNER_UNAVAILABLE` 处理，均标记可重试。
 *
 * 无论成功失败，子进程都会被 SIGKILL 并等待 `close` 后再删临时目录，不留残留进程或文件。
 * 子进程报出的 {@link HubError} 原样透传错误码与 `retryable`，宿主不重新解释。
 */
async function runIsolated<T>(input: ScanRequest): Promise<T> {
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
      child.once('message', (result: ScanResponse<T>) =>
        finish(() =>
          result.ok
            ? resolve(result.result)
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

/** 接收检查在受限堆子进程解包并返回规范化归档。 */
export function scanIsolated(input: ScanInput) {
  return runIsolated<IntakeScanResult>(input);
}

/** 结构评测独占解析进程，超时或异常退出不会阻塞宿主续租。 */
export const analyzeSkillIsolated: SkillStaticAnalyzer = (files) =>
  runIsolated<EvaluationDimensionResult>({ kind: 'structure', files });
