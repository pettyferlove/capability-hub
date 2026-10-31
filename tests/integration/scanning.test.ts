import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, lstat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ScanInput } from '@capability-hub/application/ports';
import { HubError } from '@capability-hub/domain/errors';
import { scanIsolated } from '@capability-hub/infrastructure/scanning';
import { skillDocument } from '../support/content.js';

test('真实扫描子进程只读取脚本文本，保留脚本字节和属性，不产生脚本定义的文件', async (context) => {
  const directory = await mkdtemp(join(tmpdir(), 'hub-scan-behavior-'));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const marker = join(directory, 'script-executed');
  const script = Buffer.from(
    `#!/usr/bin/env node\nrequire('node:fs').writeFileSync(${JSON.stringify(marker)}, 'executed');\n`,
  );
  const result = await scanIsolated({
    kind: 'skill',
    slug: 'sample-skill',
    files: [
      {
        path: 'SKILL.md',
        bytes: skillDocument('sample-skill', '[脚本](scripts/check.cjs)'),
        executable: false,
      },
      { path: 'scripts/check.cjs', bytes: script, executable: true },
    ],
  });
  assert.equal(result.inspected.state, 'passed');
  assert.equal(result.inspected.metadata.has_scripts, true);
  assert.deepEqual(
    result.inspected.files.find((file) => file.path === 'scripts/check.cjs')?.bytes,
    script,
  );
  await assert.rejects(() => lstat(marker), { code: 'ENOENT' });
});

test('扫描子进程区分内容校验错误与内部处理故障，内部错误经过 IPC 后仍可重试', async () => {
  await assert.rejects(
    () => scanIsolated({ kind: 'skill', slug: 'sample-skill', bytes: Buffer.from('not a ZIP') }),
    (error: unknown) =>
      error instanceof HubError &&
      error.status === 422 &&
      error.code === 'ZIP_INVALID' &&
      !error.retryable,
  );
  const invalidPortInput = {
    kind: 'skill',
    slug: 'sample-skill',
    files: [{ path: 'SKILL.md', bytes: null, executable: false }],
  } as unknown as ScanInput;
  await assert.rejects(
    () => scanIsolated(invalidPortInput),
    (error: unknown) =>
      error instanceof HubError &&
      error.status === 500 &&
      error.code === 'SCANNER_FAILED' &&
      error.retryable,
  );
});
