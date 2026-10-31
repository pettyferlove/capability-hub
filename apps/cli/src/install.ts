import { unzip } from '@capability-hub/infrastructure/content';
import type { Manifest } from '@capability-hub/contracts';
import { manifestFileSchema, manifestSchema, type ManifestFile } from '@capability-hub/contracts';
import { canonical, digest, sha256, utf8Compare } from '@capability-hub/domain/canonical';
import { fail } from '@capability-hub/domain/errors';
import { executableText } from '@capability-hub/domain/files';
import { artifactPath, collisionKey, safePath } from '@capability-hub/domain/paths';
import { lstat, mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { safeDirectory } from './filesystem.js';
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { open, readlink } from 'node:fs/promises';
export function validateManifest(value: unknown): asserts value is Manifest {
  const parsed = manifestSchema.safeParse(value);
  if (!parsed.success) fail(422, 'MANIFEST_INVALID', '内容清单格式错误');
  const manifest = parsed.data;
  let total = 0;
  let prev = '';
  const keys = new Set<string>();
  const allPaths = new Set(manifest.files.map((file) => collisionKey(file.path)));
  for (const f of manifest.files) {
    artifactPath(f.path);
    if (
      Object.keys(f).sort().join(',') !== 'executable,path,sha256,size' ||
      !Number.isSafeInteger(f.size) ||
      f.size < 0 ||
      f.size > 10 * 1024 * 1024 ||
      typeof f.executable !== 'boolean' ||
      !/^[a-f0-9]{64}$/.test(f.sha256) ||
      keys.has(collisionKey(f.path)) ||
      (prev && utf8Compare(prev, f.path) >= 0)
    )
      fail(422, 'MANIFEST_INVALID', '文件清单有无效、重复或未排序条目');
    const parents = collisionKey(f.path).split('/');
    parents.pop();
    while (parents.length) {
      if (allPaths.has(parents.join('/'))) fail(422, 'MANIFEST_INVALID', '路径同时作为文件和目录');
      parents.pop();
    }
    prev = f.path;
    keys.add(collisionKey(f.path));
    total += f.size;
    if (f.executable && ['SKILL.md', 'server.json'].includes(f.path))
      fail(422, 'MANIFEST_EXECUTABLE', '不允许的执行属性');
  }
  if (
    total > 100 * 1024 * 1024 ||
    (manifest.kind === 'skill' &&
      manifest.files.filter(
        (f) => f.path === 'SKILL.md' && f.size > 0 && f.size <= 262144 && !f.executable,
      ).length !== 1) ||
    (manifest.kind === 'mcp' &&
      (manifest.files.length !== 1 ||
        manifest.files[0].path !== 'server.json' ||
        manifest.files[0].executable))
  )
    fail(422, 'MANIFEST_INVALID', '内容清单根文件或总大小无效');
}
async function localDiff(path: string) {
  const files: string[] = [];
  async function walk(dir: string, prefix = '') {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const name = prefix + entry.name;
      if (entry.isSymbolicLink()) files.push(name + ' (symlink)');
      else if (entry.isDirectory()) await walk(join(dir, entry.name), name + '/');
      else if (name !== '.capability-hub-source') files.push(name);
    }
  }
  let expected: ManifestFile[];
  try {
    const recordPath = join(path, '.capability-hub-source');
    if (!(await lstat(recordPath)).isFile()) return ['本地来源记录不是普通文件'];
    const value: unknown = JSON.parse(await readFile(join(path, '.capability-hub-source'), 'utf8'));
    if (!value || typeof value !== 'object' || !('files' in value))
      throw new Error('Invalid receipt');
    expected = manifestFileSchema.array().parse(value.files);
  } catch {
    return ['目录不是已验证的 Hub 安装'];
  }
  await walk(path);
  const diff: string[] = [];
  for (const f of expected) {
    safePath(f.path);
    if (!files.includes(f.path)) {
      diff.push('缺失或链接 ' + f.path);
      continue;
    }
    try {
      const stat = await lstat(join(path, f.path));
      if (
        !stat.isFile() ||
        sha256(await readFile(join(path, f.path))) !== f.sha256 ||
        Boolean(stat.mode & 0o111) !== f.executable
      )
        diff.push('修改 ' + f.path);
    } catch {
      diff.push('缺失 ' + f.path);
    }
  }
  for (const f of files) if (!expected.some((e) => e.path === f)) diff.push('新增 ' + f);
  return diff;
}
export async function install(input: {
  slug: string;
  to: string;
  manifest: Manifest;
  content_digest: string;
  artifact_digest: string;
  archive: Buffer;
  source: Record<string, unknown>;
  dryRun?: boolean;
  replace?: boolean;
  beforeCommit?: () => Promise<void>;
}) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input.slug) || input.slug.length > 64)
    fail(422, 'INVALID_SLUG', '资产名称无效');
  validateManifest(input.manifest);
  if (digest(canonical(input.manifest)) !== input.content_digest)
    fail(422, 'CONTENT_DIGEST_MISMATCH', '规范内容摘要不匹配');
  if (digest(input.archive) !== input.artifact_digest)
    fail(422, 'ARTIFACT_DIGEST_MISMATCH', '下载归档摘要不匹配');
  const files = await unzip(input.archive);
  if (files.length !== input.manifest.files.length)
    fail(422, 'ARCHIVE_MANIFEST_MISMATCH', 'ZIP 与清单文件数不匹配');
  for (const f of input.manifest.files) {
    const actual = files.find((a) => a.path === f.path);
    if (
      !actual ||
      actual.bytes.length !== f.size ||
      sha256(actual.bytes) !== f.sha256 ||
      executableText(actual.path, actual.bytes) !== f.executable
    )
      fail(422, 'FILE_DIGEST_MISMATCH', '文件校验失败：' + f.path);
  }
  const root = await safeDirectory(input.to, !input.dryRun);
  const destination = join(root, input.slug);
  if (input.dryRun) return describeDestination(destination, input.manifest, true);
  const originalRoot = await lstat(root, { bigint: true });
  const assertRoot = async () => {
    await safeDirectory(root, false);
    const current = await lstat(root, { bigint: true });
    if (current.dev !== originalRoot.dev || current.ino !== originalRoot.ino)
      fail(409, 'INSTALL_TARGET_CHANGED', '安装父目录在准备期间发生变化，请检查后重试');
  };
  const lock = join(root, `.${input.slug}.install-lock`);
  try {
    await mkdir(lock, { mode: 0o700 });
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'EEXIST')
      fail(
        409,
        'INSTALL_BUSY',
        '该资源正在安装；如上次进程异常退出，请确认没有安装进程后移除锁目录',
        { lock },
      );
    throw error;
  }
  let staging: string | undefined;
  let backup: string | undefined;
  let backupDirectory: string | undefined;
  try {
    const description = await describeDestination(destination, input.manifest, false);
    if (description.existing && !input.replace)
      fail(409, 'TARGET_EXISTS', '目标目录已存在，请先检查差异并显式 --replace', description);
    const initialFingerprint = description.existing
      ? await directoryFingerprint(destination)
      : null;
    staging = await mkdtemp(join(root, '.capability-hub-stage-'));
    for (const file of input.manifest.files) {
      const path = join(staging, file.path);
      await mkdir(dirname(path), { recursive: true, mode: 0o700 });
      await writeFile(path, files.find((entry) => entry.path === file.path)!.bytes, {
        mode: file.executable ? 0o700 : 0o600,
        flag: 'wx',
      });
    }
    await writeFile(
      join(staging, '.capability-hub-source'),
      JSON.stringify(
        {
          ...input.source,
          content_digest: input.content_digest,
          files: input.manifest.files,
        },
        null,
        2,
      ) + '\n',
      { mode: 0o600, flag: 'wx' },
    );
    await input.beforeCommit?.();
    await assertRoot();
    // 网络授权确认期间目标可能被修改，提交前比较实际字节和文件属性。
    const current = await describeDestination(destination, input.manifest, false);
    if (
      current.existing !== description.existing ||
      (current.existing ? await directoryFingerprint(destination) : null) !== initialFingerprint
    )
      fail(409, 'INSTALL_TARGET_CHANGED', '安装目标在准备期间发生变化，请检查后重试');
    if (current.existing) {
      backupDirectory = await mkdtemp(join(root, `.${input.slug}.backup-`));
      const backupPath = join(backupDirectory, input.slug);
      await rename(destination, backupPath);
      backup = backupPath;
    }
    await rename(staging, destination);
    staging = undefined;
    return { dry_run: false, destination, backup, files: input.manifest.files.length };
  } catch (error) {
    if (backup) {
      try {
        await assertRoot();
        if (await directoryExists(destination))
          throw new Error('恢复位置已被占用', { cause: error });
        await rename(backup, destination);
        backup = undefined;
      } catch (restoreError) {
        throw new AggregateError([error, restoreError], '安装失败，请从 ' + backup + ' 手动恢复', {
          cause: restoreError,
        });
      }
    }
    throw error;
  } finally {
    // 父目录被移走时，原路径可能已指向其他内容，不能再用它执行清理。
    if (
      await assertRoot().then(
        () => true,
        () => false,
      )
    )
      await Promise.all([
        ...(staging ? [rm(staging, { recursive: true, force: true })] : []),
        ...(backupDirectory && !backup
          ? [rm(backupDirectory, { recursive: true, force: true })]
          : []),
        rm(lock, { recursive: true, force: true }),
      ]);
  }
}

async function directoryExists(path: string): Promise<boolean> {
  try {
    const stat = await lstat(path);
    if (stat.isSymbolicLink() || !stat.isDirectory())
      fail(422, 'INSTALL_PATH', '目标不能是链接或普通文件');
    return true;
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')
      return false;
    throw error;
  }
}
async function describeDestination(destination: string, manifest: Manifest, dryRun: boolean) {
  const existing = await directoryExists(destination);
  return {
    dry_run: dryRun,
    destination,
    files: manifest.files.map((file) => file.path),
    existing,
    differences: existing ? await localDiff(destination) : [],
  };
}

async function directoryFingerprint(directory: string): Promise<string> {
  const hash = createHash('sha256');
  async function walk(path: string, relative = ''): Promise<void> {
    const stat = await lstat(path);
    hash.update(
      JSON.stringify([
        relative,
        stat.dev,
        stat.ino,
        stat.mode,
        stat.size,
        stat.mtimeMs,
        stat.ctimeMs,
      ]),
    );
    if (stat.isSymbolicLink()) hash.update(await readlink(path));
    else if (stat.isDirectory()) {
      for (const name of (await readdir(path)).sort(utf8Compare))
        await walk(join(path, name), relative + '/' + name);
    } else if (stat.isFile()) {
      const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
      try {
        for await (const bytes of file.createReadStream({ autoClose: false }))
          hash.update(bytes as Buffer);
      } finally {
        await file.close();
      }
    } else fail(422, 'INSTALL_PATH', '安装目标包含特殊文件');
  }
  await walk(directory);
  return hash.digest('hex');
}
