import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { test, type TestContext } from 'node:test';
import { syncBuiltinESMExports } from 'node:module';
import type { BigIntStats, Stats } from 'node:fs';
import fs, {
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
import { basename, dirname, join } from 'node:path';
import { install, localDiff, remove } from '../../apps/cli/src/install.js';
import { installedSkills } from '../../apps/cli/src/installed-skills.js';
import { archive, inspect, unzip } from '@capability-hub/infrastructure/content';
import { digest, canonical, sha256 } from '@capability-hub/domain/canonical';
import { HubError } from '@capability-hub/domain/errors';
import { hubClientSkillFiles, skillDocument } from '../support/content.js';
import { deferred } from '../support/store.js';

async function installation(
  context: TestContext,
  body?: string,
  extraFiles: Parameters<typeof archive>[0] = [],
) {
  const root = await mkdtemp(join(await realpath(tmpdir()), 'capability-hub-install-'));
  context.after(() => rm(root, { recursive: true, force: true }));
  const result = inspect(
    'skill',
    [
      { path: 'SKILL.md', bytes: skillDocument('sample-skill', body), executable: false },
      ...extraFiles,
    ],
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
    source: {
      hub_url: 'https://hub.example.test',
      asset_id: randomUUID(),
      version_id: randomUUID(),
    },
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
  assert.deepEqual(preview.differences, process.platform === 'win32' ? [] : ['修改 SKILL.md']);
  assert.deepEqual(await readFile(path), skillDocument('sample-skill'));
});

test('Windows 本地差异忽略脚本执行位缺失，仍识别同大小的字节修改', async (context) => {
  const script = 'scripts/check.py';
  const input = await installation(context, undefined, [
    { path: script, bytes: Buffer.from('print(1)\n'), executable: true },
  ]);
  await install(input);
  const directory = join(input.to, input.slug);
  const path = join(directory, script);
  await chmod(path, 0o600);
  const platform = Object.getOwnPropertyDescriptor(process, 'platform')!;
  Object.defineProperty(process, 'platform', { value: 'win32' });
  context.after(() => Object.defineProperty(process, 'platform', platform));

  assert.deepEqual(await localDiff(directory, input.manifest.files), []);
  await writeFile(path, 'print(2)\n');
  assert.deepEqual(await localDiff(directory, input.manifest.files), [`修改 ${script}`]);
});

test('只差换行符的文件单独标注，仍计为本地修改', async (context) => {
  const input = await installation(context);
  await install(input);
  const directory = join(input.to, input.slug);
  const path = join(directory, 'SKILL.md');
  const crlf = (await readFile(path, 'utf8')).replaceAll('\n', '\r\n');
  await writeFile(path, crlf);
  assert.deepEqual(await localDiff(directory), ['仅换行符不同 SKILL.md']);
  await writeFile(path, crlf + '追加内容');
  assert.deepEqual(await localDiff(directory), ['修改 SKILL.md']);
});

test('PowerShell 写出的带 BOM 或 UTF-16LE 来源记录仍能识别为已验证安装', async (context) => {
  const input = await installation(context);
  const source = {
    hub_url: 'https://hub.example.test',
    asset_id: randomUUID(),
    version_id: randomUUID(),
  };
  await install({ ...input, source });
  const directory = join(input.to, input.slug);
  const recordPath = join(directory, '.capability-hub-source');
  const record = await readFile(recordPath, 'utf8');
  for (const bytes of [
    Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(record)]),
    Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(record, 'utf16le')]),
  ]) {
    await writeFile(recordPath, bytes);
    assert.deepEqual(await localDiff(directory), []);
    const { installs } = await installedSkills([input.to]);
    assert.deepEqual(
      installs.map(({ receipt }) => [receipt.version_id, receipt.slug]),
      [[source.version_id, input.slug]],
    );
  }
});

test('删除拒绝无来源记录或已修改的目录，force 删除时报告丢弃的差异', async (context) => {
  const input = await installation(context);
  await install(input);
  const manual = join(input.to, 'manual-skill');
  await mkdir(manual);
  await writeFile(join(manual, 'SKILL.md'), '# 手写规范\n');
  await assert.rejects(
    () => remove({ slug: 'manual-skill', to: input.to, force: true }),
    code('INSTALL_UNVERIFIED'),
  );
  await writeFile(join(input.to, input.slug, 'notes.md'), '本地笔记');
  for (const dryRun of [true, false])
    await assert.rejects(
      () => remove({ slug: input.slug, to: input.to, dryRun }),
      code('INSTALL_MODIFIED'),
    );
  const result = await remove({ slug: input.slug, to: input.to, force: true });
  assert.deepEqual(result.differences, ['新增 notes.md']);
  assert.deepEqual(await readdir(input.to), ['manual-skill']);
});

test('清单和磁盘完全相符也不能凭缺失身份或无效 Hub 的记录删除安装', async (context) => {
  const input = await installation(context);
  await install(input);
  const directory = join(input.to, input.slug);
  const path = join(directory, '.capability-hub-source');
  const legacy = { ...input.source, files: input.manifest.files };
  for (const invalid of [
    { files: legacy.files },
    { ...legacy, version_id: 'unknown' },
    { ...legacy, hub_url: 'https://hub.example.test/not-a-hub' },
  ]) {
    await writeFile(path, JSON.stringify(invalid));
    await assert.rejects(remove({ ...input, force: true }), code('INSTALL_UNVERIFIED'));
    await assert.rejects(installedSkills([input.to]), /来源记录无效/);
    assert.deepEqual(await readFile(join(directory, 'SKILL.md')), skillDocument('sample-skill'));
  }
  await writeFile(path, JSON.stringify({ ...legacy, hub_url: input.source.hub_url + '/' }));
  assert.equal(
    (await installedSkills([input.to])).installs[0].receipt.hub_url,
    input.source.hub_url,
  );
  assert.deepEqual((await remove(input)).removed, [directory]);
});

test('删除暂存发生同步更新时停止；可安全恢复才还原目录，否则保留两份并指出位置', async (context) => {
  const input = await installation(context);
  await install(input);
  const directory = join(input.to, input.slug);
  const move = fs.rename;
  let staged = '';
  let occupied = false;
  const mock = context.mock.method(fs, 'rename', async (...paths: Parameters<typeof move>) => {
    await move(...paths);
    if (paths[0] !== directory) return;
    staged = String(paths[1]);
    await writeFile(join(staged, 'SKILL.md'), occupied ? '另一次同步' : '同步期间的新内容');
    if (occupied) {
      await mkdir(directory);
      await writeFile(join(directory, 'local.txt'), '已占用');
    }
  });
  syncBuiltinESMExports();
  try {
    await assert.rejects(remove({ ...input, force: true }), code('INSTALL_TARGET_CHANGED'));
    assert.equal(await readFile(join(directory, 'SKILL.md'), 'utf8'), '同步期间的新内容');
    assert.deepEqual(await readdir(input.to), [input.slug]);
    occupied = true;
    await assert.rejects(
      remove({ ...input, force: true }),
      (error: unknown) => error instanceof AggregateError && error.message.includes(staged),
    );
    assert.equal(await readFile(join(staged, 'SKILL.md'), 'utf8'), '另一次同步');
    assert.equal(await readFile(join(directory, 'local.txt'), 'utf8'), '已占用');
  } finally {
    mock.mock.restore();
    syncBuiltinESMExports();
  }
});

test('删除或替换搬移到另一目录时，把未动的目录还到原位，不删除或覆盖其内容', async (context) => {
  for (const replace of [false, true]) {
    const input = await installation(context);
    await install(input);
    const directory = join(input.to, input.slug);
    const original = join(dirname(input.to), 'original');
    const move = fs.rename;
    const mock = context.mock.method(fs, 'rename', async (...paths: Parameters<typeof move>) => {
      if (paths[0] === directory) {
        await move(directory, original);
        await mkdir(directory);
        await writeFile(join(directory, 'keep.txt'), '新目录内容');
      }
      await move(...paths);
    });
    syncBuiltinESMExports();
    try {
      await assert.rejects(
        replace ? install({ ...input, replace }) : remove(input),
        code('INSTALL_TARGET_CHANGED'),
      );
      assert.equal(await readFile(join(directory, 'keep.txt'), 'utf8'), '新目录内容');
      assert.deepEqual(await readFile(join(original, 'SKILL.md')), skillDocument('sample-skill'));
      assert.deepEqual(await readdir(input.to), [input.slug]);
    } finally {
      mock.mock.restore();
      syncBuiltinESMExports();
    }
  }
});

test('目录搬移后编号变化，仍可凭目录句柄完成替换和删除', async (context) => {
  const input = await installation(context);
  await install(input);
  const directory = join(input.to, input.slug);
  const { lstat, open } = fs;
  const probe = await open(directory, 'r').catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'EISDIR' || error.code === 'EPERM' || error.code === 'EACCES') return null;
    throw error;
  });
  if (!probe) return context.skip('此夹具需要可打开的目录句柄');
  await probe.close();
  // 模拟按目录项位置编号：原位的 lstat 和句柄 stat 返回同一编号，移走后改用真实编号。
  const atOriginalSlot = (stat: BigIntStats | Stats) => {
    stat.ino = typeof stat.ino === 'bigint' ? stat.ino + 1n : stat.ino + 1;
    return stat;
  };
  const pathStat = context.mock.method(fs, 'lstat', async (...args: Parameters<typeof lstat>) => {
    const stat = await lstat(...args);
    return args[0] === directory ? atOriginalSlot(stat) : stat;
  });
  const openFile = context.mock.method(fs, 'open', async (...args: Parameters<typeof open>) => {
    const file = await open(...args);
    if (args[0] === directory) {
      const stat = file.stat.bind(file);
      context.mock.method(file, 'stat', async (...options: Parameters<typeof stat>) => {
        const current = await stat(...options);
        const beforeMove = await lstat(directory).catch((error: NodeJS.ErrnoException) => {
          if (error.code === 'ENOENT') return null;
          throw error;
        });
        return current && beforeMove ? atOriginalSlot(current) : current;
      });
    }
    return file;
  });
  syncBuiltinESMExports();
  try {
    const result = await install({ ...input, replace: true });
    assert('backup' in result && result.backup);
    await remove({ ...input, force: true });
    assert.deepEqual(
      await readFile(join(result.backup, 'SKILL.md')),
      skillDocument('sample-skill'),
    );
    assert.deepEqual(await readdir(input.to), [basename(dirname(result.backup))]);
  } finally {
    openFile.mock.restore();
    pathStat.mock.restore();
    syncBuiltinESMExports();
  }
});

test('删除中断时报告残余暂存位置，不把部分删除的内容恢复成安装', async (context) => {
  const input = await installation(context);
  await install(input);
  const unlink = fs.unlink;
  let remaining = '';
  const mock = context.mock.method(fs, 'unlink', async (path: Parameters<typeof unlink>[0]) => {
    if (basename(String(path)) === 'SKILL.md') {
      remaining = String(path);
      throw new Error('文件正被占用');
    }
    await unlink(path);
  });
  syncBuiltinESMExports();
  try {
    await assert.rejects(
      remove(input),
      (error: unknown) =>
        error instanceof AggregateError && error.message.includes(dirname(remaining)),
    );
    await assert.rejects(readdir(join(input.to, input.slug)), { code: 'ENOENT' });
    assert.deepEqual(await readdir(dirname(remaining)), ['SKILL.md']);
    assert.deepEqual(await readFile(remaining), skillDocument('sample-skill'));
  } finally {
    mock.mock.restore();
    syncBuiltinESMExports();
  }
});

test('删除预览不改动文件，删除安装时保留替换备份，显式 backups 才清理', async (context) => {
  const input = await installation(context);
  await install(input);
  await install({ ...input, replace: true });
  const destination = join(input.to, input.slug);
  const preview = await remove({ slug: input.slug, to: input.to, dryRun: true });
  assert.deepEqual(preview.removed, [destination]);
  assert.equal(preview.backups?.length, 1);
  assert.deepEqual(await readFile(join(destination, 'SKILL.md')), skillDocument('sample-skill'));
  const removed = await remove({ slug: input.slug, to: input.to });
  await assert.rejects(() => readdir(destination), { code: 'ENOENT' });
  assert.deepEqual(
    (await readdir(input.to)).map((name) => join(input.to, name)),
    removed.backups,
  );
  const backups = await remove({ slug: input.slug, to: input.to, backups: true });
  assert.deepEqual(backups.removed, removed.backups);
  assert.deepEqual(await readdir(input.to), []);
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

test('超过上传限额的合法发布 ZIP 仍可逐文件校验并安装', async (context) => {
  const input = await installation(context);
  const payload = randomBytes(7 * 1024 * 1024);
  payload[0] = 0;
  const files = [
    { path: 'SKILL.md', bytes: skillDocument('sample-skill'), executable: false },
    ...['a.bin', 'b.bin', 'c.bin'].map((path) => ({ path, bytes: payload, executable: false })),
  ];
  const bytes = await archive(files);
  assert(bytes.length > 20 * 1024 * 1024);
  await assert.rejects(unzip(bytes), code('UPLOAD_SIZE'));
  const manifest = {
    ...input.manifest,
    files: files.map(({ path, bytes, executable }) => ({
      path,
      size: bytes.length,
      sha256: sha256(bytes),
      executable,
    })),
  };
  await install({
    ...input,
    archive: bytes,
    artifact_digest: digest(bytes),
    manifest,
    content_digest: digest(canonical(manifest)),
  });
  assert.deepEqual(await readFile(join(input.to, input.slug, 'c.bin')), payload);
});

test('完整包校验拒绝缺失、多余或被修改的附属文件并保留已有安装', async (context) => {
  const destination = await installation(context);
  const files = await hubClientSkillFiles();
  const reference = files.find((file) => file.path.startsWith('references/'));
  assert(reference);
  const inspected = inspect('skill', files, 'use-capability-hub');
  const bytes = await archive(files);
  const input = {
    ...destination,
    slug: 'use-capability-hub',
    manifest: inspected.manifest,
    content_digest: inspected.content_digest,
    artifact_digest: digest(bytes),
    archive: bytes,
  };
  await install(input);
  for (const [variant, expected] of [
    [files.filter((file) => file.path !== reference.path), 'ARCHIVE_MANIFEST_MISMATCH'],
    [
      [...files, { path: 'extra.md', bytes: Buffer.from('附加文件'), executable: false }],
      'ARCHIVE_MANIFEST_MISMATCH',
    ],
    [
      files.map((file) =>
        file.path === reference.path ? { ...file, bytes: Buffer.from('资料被修改') } : file,
      ),
      'FILE_DIGEST_MISMATCH',
    ],
  ] as const) {
    const damaged = await archive([...variant]);
    await assert.rejects(
      () =>
        install({ ...input, archive: damaged, artifact_digest: digest(damaged), replace: true }),
      code(expected),
    );
    for (const file of files)
      assert.deepEqual(await readFile(join(input.to, input.slug, file.path)), file.bytes);
  }
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

test('清单在任意层级混用目录拼写都拒绝，不依赖当前文件系统合并大小写', async (context) => {
  const input = await installation(context);
  for (const paths of [
    ['Docs/a', 'SKILL.md', 'docs/b'],
    ['SKILL.md', 'docs/Ref/a', 'docs/ref/b'],
  ]) {
    const manifest = {
      ...input.manifest,
      files: paths.map((path) => ({ ...input.manifest.files[0], path })),
    };
    await assert.rejects(
      install({ ...input, manifest, content_digest: digest(canonical(manifest)) }),
      code('MANIFEST_INVALID'),
    );
  }
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

test('授权等待期间锁或安装暂存目录被替换，不提交也不递归清理替代目录', async (context) => {
  for (const part of ['lock', 'stage']) {
    const input = await installation(context);
    let marker = '';
    await assert.rejects(
      install({
        ...input,
        beforeCommit: async () => {
          const name = (await readdir(input.to)).find((entry) =>
            part === 'lock'
              ? entry.endsWith('.install-lock')
              : entry.startsWith('.capability-hub-stage-'),
          );
          assert(name);
          const path = join(input.to, name);
          await rename(path, path + '-moved');
          await mkdir(path);
          marker = join(path, 'keep.txt');
          await writeFile(marker, '无关内容');
        },
      }),
      code('INSTALL_TARGET_CHANGED'),
    );
    assert.equal(await readFile(marker, 'utf8'), '无关内容');
    await assert.rejects(readFile(join(input.to, input.slug, 'SKILL.md')), { code: 'ENOENT' });
  }
});

test('安装目录经过根目录下的系统链接（如 macOS 的 /var）时按真实路径写入', async (context) => {
  // 不调用 realpath：macOS 的 tmpdir() 位于根目录的 /var 链接之下。
  const root = await mkdtemp(join(tmpdir(), 'capability-hub-system-link-'));
  context.after(() => rm(root, { recursive: true, force: true }));
  const input = { ...(await installation(context)), to: join(root, 'skills') };
  const result = await install(input);
  assert.equal(result.destination, join(await realpath(root), 'skills', input.slug));
  assert.deepEqual(
    await readFile(join(input.to, input.slug, 'SKILL.md')),
    skillDocument('sample-skill'),
  );
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
