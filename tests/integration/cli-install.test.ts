import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { install } from '../../apps/cli/src/install.js';
import { archive, inspect } from '@capability-hub/infrastructure/content';
import { digest, canonical } from '@capability-hub/domain/canonical';
import { HubError } from '@capability-hub/domain/errors';
import { skillDocument } from '../support/content.js';
import { deferred } from '../support/store.js';

async function installation(context: TestContext, body?: string) {
  const root = await mkdtemp(join(await realpath(tmpdir()), 'capability-hub-install-'));
  context.after(() => rm(root, { recursive: true, force: true }));
  const result = inspect(
    'skill',
    [{ path: 'SKILL.md', bytes: skillDocument('sample-skill', body), executable: false }],
    'sample-skill',
  );
  const bytes = await archive(result.files);
  return {
    slug: 'sample-skill',
    to: join(root, 'skills'),
    manifest: result.manifest,
    content_digest: digest(canonical(result.manifest)),
    artifact_digest: digest(bytes),
    archive: bytes,
    source: { hub_url: 'https://hub.example.test' },
  };
}

const code = (expected: string) => (error: unknown) =>
  error instanceof HubError && error.code === expected;

test('安装预览识别执行权限变化，即使文件字节没有修改', async (context) => {
  const input = await installation(context);
  await install(input);
  const path = join(input.to, input.slug, 'SKILL.md');
  await chmod(path, 0o700);
  const preview = await install({ ...input, dryRun: true });
  assert('differences' in preview);
  assert.deepEqual(preview.differences, ['修改 SKILL.md']);
  assert.deepEqual(await readFile(path), skillDocument('sample-skill'));
});

test('安装逐字节校验并写入私有目录，dry-run 不创建路径，默认拒绝覆盖', async (context) => {
  const input = await installation(context);
  const preview = await install({ ...input, dryRun: true });
  assert.equal(preview.dry_run, true);
  await assert.rejects(() => readFile(join(input.to, input.slug, 'SKILL.md')), { code: 'ENOENT' });
  await install(input);
  assert.deepEqual(
    await readFile(join(input.to, input.slug, 'SKILL.md')),
    skillDocument('sample-skill'),
  );
  await assert.rejects(() => install(input), code('TARGET_EXISTS'));
  await assert.rejects(
    () => install({ ...input, archive: Buffer.from('tampered') }),
    code('ARTIFACT_DIGEST_MISMATCH'),
  );
});

test('安装授权失效保持原目录，明确替换保留旧内容备份，锁和暂存目录会清理', async (context) => {
  const input = await installation(context);
  await install(input);
  const destination = join(input.to, input.slug);
  const edited = Buffer.from('用户已修改的内容');
  await writeFile(join(destination, 'SKILL.md'), edited);
  await assert.rejects(
    () =>
      install({
        ...input,
        replace: true,
        beforeCommit: () => Promise.reject(new Error('授权已撤销')),
      }),
    /授权已撤销/,
  );
  assert.deepEqual(await readFile(join(destination, 'SKILL.md')), edited);
  const result = await install({ ...input, replace: true });
  assert('backup' in result && result.backup);
  assert.deepEqual(await readFile(join(result.backup, 'SKILL.md')), edited);
  assert.deepEqual(await readFile(join(destination, 'SKILL.md')), skillDocument('sample-skill'));
  assert.equal(
    (await readdir(input.to)).some(
      (name) => name.endsWith('.install-lock') || name.startsWith('.capability-hub-stage-'),
    ),
    false,
  );
});

test('两个安装进程不能同时提交同一目标，链接目标被拒绝', async (context) => {
  const input = await installation(context);
  const entered = deferred();
  const finish = deferred();
  const first = install({
    ...input,
    beforeCommit: async () => {
      entered.resolve();
      await finish.promise;
    },
  });
  await entered.promise;
  await assert.rejects(() => install(input), code('INSTALL_BUSY'));
  finish.resolve();
  await first;
  const outside = await installation(context);
  await symlink(input.to, outside.to);
  await assert.rejects(() => install(outside), code('INSTALL_PATH'));
});

test('清单不能占用安装器来源记录，也不能把同一路径同时声明为文件和目录', async (context) => {
  const input = await installation(context);
  const reserved = {
    ...input.manifest,
    files: [
      { ...input.manifest.files[0], path: '.capability-hub-source' },
      ...input.manifest.files,
    ],
  };
  await assert.rejects(
    () => install({ ...input, manifest: reserved, content_digest: digest(canonical(reserved)) }),
    code('RESERVED_PATH'),
  );
  const overlap = {
    ...input.manifest,
    files: ['A', 'A/b', 'SKILL.md'].map((path) => ({ ...input.manifest.files[0], path })),
  };
  await assert.rejects(
    () => install({ ...input, manifest: overlap, content_digest: digest(canonical(overlap)) }),
    code('MANIFEST_INVALID'),
  );
});

test('准备期间再次修改已修改文件仍会阻止替换，保留用户最后一次写入', async (context) => {
  const input = await installation(context);
  await install(input);
  const path = join(input.to, input.slug, 'SKILL.md');
  await writeFile(path, '第一次编辑');
  await assert.rejects(
    () => install({ ...input, replace: true, beforeCommit: () => writeFile(path, '第二次编辑') }),
    code('INSTALL_TARGET_CHANGED'),
  );
  assert.equal(await readFile(path, 'utf8'), '第二次编辑');
  assert.equal(
    (await readdir(input.to)).some(
      (name) => name.endsWith('.install-lock') || name.startsWith('.capability-hub-stage-'),
    ),
    false,
  );
});

test('授权等待期间父目录被换成链接时拒绝提交，清理也不能删除链接指向目录中的同名文件', async (context) => {
  const input = await installation(context);
  const outside = join(dirname(input.to), 'outside');
  const untouched = join(outside, `.${input.slug}.install-lock`, 'keep.txt');
  await mkdir(dirname(untouched), { recursive: true });
  await writeFile(untouched, 'unrelated content');
  await assert.rejects(
    () =>
      install({
        ...input,
        beforeCommit: async () => {
          await rename(input.to, input.to + '-moved');
          await symlink(outside, input.to);
        },
      }),
    code('INSTALL_PATH'),
  );
  assert.equal(await readFile(untouched, 'utf8'), 'unrelated content');
  assert.deepEqual(await readdir(outside), [`.${input.slug}.install-lock`]);
});

test('CLI 安装保持未知二进制与脚本资源字节，不重新按语言或格式阻断已审核内容', async (context) => {
  const input = await installation(context);
  const resource = Buffer.from([0x4d, 0x5a, 0x00, 0x80]);
  const result = inspect(
    'skill',
    [
      { path: 'SKILL.md', bytes: skillDocument(), executable: false },
      { path: 'resources/tool.unknown', bytes: resource, executable: false },
      { path: 'scripts/demo.groovy', bytes: Buffer.from('println "sample"'), executable: false },
    ],
    'sample-skill',
  );
  const bytes = await archive(result.files);
  await install({
    ...input,
    manifest: result.manifest,
    content_digest: result.content_digest,
    artifact_digest: digest(bytes),
    archive: bytes,
  });
  assert.deepEqual(await readFile(join(input.to, input.slug, 'resources/tool.unknown')), resource);
  assert.equal(
    await readFile(join(input.to, input.slug, 'scripts/demo.groovy'), 'utf8'),
    'println "sample"',
  );
});
