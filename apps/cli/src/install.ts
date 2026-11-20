import { unzip } from '@capability-hub/infrastructure/content/zip-archive';
import type { Manifest } from '@capability-hub/contracts';
import {
  assetSlugSchema,
  manifestFileSchema,
  manifestSchema,
  type ManifestFile,
} from '@capability-hub/contracts';
import { canonical, digest, sha256, utf8Compare } from '@capability-hub/domain/canonical';
import { fail } from '@capability-hub/domain/errors';
import { executableText } from '@capability-hub/domain/files';
import {
  artifactPath,
  collisionKey,
  installSourceFile,
  safePath,
} from '@capability-hub/domain/paths';
import { lstat, mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { safeDirectory } from './filesystem.js';
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { open, readlink } from 'node:fs/promises';

/**
 * 清单校验：路径必须已排序且无大小写/规范化碰撞、不能同时是文件与目录，单文件 ≤10 MiB、
 * 总计 ≤100 MiB；`skill` 必须恰有一个非执行的 SKILL.md，`mcp` 只能是单个非执行的 server.json。
 * 校验失败抛 422（`MANIFEST_INVALID`、`MANIFEST_EXECUTABLE`），供安装前拒绝而不是安装中途失败。
 */
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

/**
 * 来源记录可能由 Agent 自行写入：Windows PowerShell 5.1 的 `Set-Content -Encoding UTF8` 带 BOM，
 * `Out-File` 默认写 UTF-16LE。按 BOM 选择编码，TextDecoder 会去掉 BOM。
 */
export async function readSourceRecord(path: string): Promise<unknown> {
  const bytes = await readFile(path);
  const encoding = bytes[0] === 0xff && bytes[1] === 0xfe ? 'utf-16le' : 'utf-8';
  return JSON.parse(new TextDecoder(encoding).decode(bytes));
}

/** 来源记录中的文件清单；记录缺失、不是普通文件或格式无效时返回原因。 */
async function recordedFiles(directory: string): Promise<ManifestFile[] | string> {
  try {
    const recordPath = join(directory, installSourceFile);
    if (!(await lstat(recordPath)).isFile()) return '本地来源记录不是普通文件';
    const value = await readSourceRecord(recordPath);
    if (!value || typeof value !== 'object' || !('files' in value))
      throw new Error('Invalid receipt');
    return manifestFileSchema.array().parse(value.files);
  } catch {
    return '目录不是已验证的 Hub 安装';
  }
}

/** Git 在 Windows 检出时常把 LF 转为 CRLF；只用于说明差异原因，不放宽内容校验。 */
function lineFeedBytes(bytes: Buffer) {
  return bytes.includes(0x0d)
    ? Buffer.from(bytes.toString('latin1').replaceAll('\r\n', '\n'), 'latin1')
    : bytes;
}

/** 替换预览与只读检查共用判定；符号链接按变更处理。 */
export async function localDiff(path: string, receiptFiles?: ManifestFile[]) {
  const files: string[] = [];
  async function walk(dir: string, prefix = '') {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const name = prefix + entry.name;
      if (entry.isSymbolicLink()) files.push(name + ' (symlink)');
      else if (entry.isDirectory()) await walk(join(dir, entry.name), name + '/');
      else if (name !== installSourceFile) files.push(name);
    }
  }
  const expected = receiptFiles ?? (await recordedFiles(path));
  if (typeof expected === 'string') return [expected];
  await walk(path);
  const diff: string[] = [];
  const checkExecutable = process.platform !== 'win32';
  for (const f of expected) {
    safePath(f.path);
    if (!files.includes(f.path)) {
      diff.push('缺失或链接 ' + f.path);
      continue;
    }
    try {
      const stat = await lstat(join(path, f.path));
      const bytes = stat.isFile() ? await readFile(join(path, f.path)) : null;
      const same = bytes !== null && sha256(bytes) === f.sha256;
      const executableChanged =
        checkExecutable && stat.isFile() && Boolean(stat.mode & 0o111) !== f.executable;
      if (!same && !executableChanged && bytes && sha256(lineFeedBytes(bytes)) === f.sha256)
        diff.push('仅换行符不同 ' + f.path);
      else if (!same || executableChanged) diff.push('修改 ' + f.path);
    } catch {
      diff.push('缺失 ' + f.path);
    }
  }
  for (const f of files) if (!expected.some((e) => e.path === f)) diff.push('新增 ' + f);
  return diff;
}

interface InstallTarget {
  slug: string;
  to: string;
  manifest: Manifest;
  content_digest: string;
  dryRun?: boolean;
  replace?: boolean;
}

/** 预览列出文件路径，正式写入后仅返回文件数与备份位置。 */
export type InstallResult =
  | {
      dry_run: true;
      destination: string;
      files: string[];
      existing: boolean;
      differences: string[];
    }
  | { dry_run: false; destination: string; backup?: string; files: number };

/** 票据预览只取得清单，因此归档摘要与逐文件校验留到安装时。 */
export function validateInstallManifest(input: Pick<InstallTarget, 'manifest' | 'content_digest'>) {
  validateManifest(input.manifest);
  if (digest(canonical(input.manifest)) !== input.content_digest)
    fail(422, 'CONTENT_DIGEST_MISMATCH', '规范内容摘要不匹配');
}

/** 兑换前检查目标，但不创建目录，也不替代安装提交时的锁与复核。 */
export async function preflightInstall(input: InstallTarget) {
  const destination = join(await safeDirectory(input.to, false), input.slug);
  if (input.dryRun) return describeDestination(destination, input.manifest, true);
  if ((await directoryExists(destination)) && !input.replace) targetExists();
}

function targetExists(description?: unknown): never {
  fail(409, 'TARGET_EXISTS', '目标目录已存在，请先检查差异并显式 --replace', description);
}

/** 同一父目录下同名 Skill 的安装与删除互斥；进程异常退出后锁目录需人工移除。 */
async function lockSkill(root: string, slug: string) {
  const lock = join(root, `.${slug}.install-lock`);
  try {
    await mkdir(lock, { mode: 0o700 });
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'EEXIST')
      fail(
        409,
        'INSTALL_BUSY',
        '该资源正在安装或删除；如上次进程异常退出，请确认没有相关进程后移除锁目录',
        { lock },
      );
    throw error;
  }
  return lock;
}

/**
 * 把归档原子地装进 `to/<slug>`，全程只写显式给出的目标目录，不执行其中任何内容。
 * 前置校验：slug 合法、清单合规、清单与归档各自的摘要匹配、逐文件比对大小与 SHA-256，
 * 任一不符按 422 拒绝。提交阶段持锁目录（并发安装 409 `INSTALL_BUSY`），先写 staging、
 * 再确认目标目录未被移动、内容指纹未变化（否则 409 `INSTALL_TARGET_CHANGED`），
 * 然后 rename 替换并把旧目录挪到备份；失败时回滚，回滚也不成立才以 `AggregateError`
 * 连备份路径一起抛出。`beforeCommit` 用于提交前再做一次远端校验（例如重新拉清单）。
 * `dryRun` 只返回差异，不创建任何目录。
 */
export async function install(
  input: InstallTarget & {
    artifact_digest: string;
    archive: Buffer;
    source: Record<string, unknown>;
    beforeCommit?: () => Promise<void>;
  },
): Promise<InstallResult> {
  if (!assetSlugSchema.safeParse(input.slug).success) fail(422, 'INVALID_SLUG', '资产名称无效');
  validateInstallManifest(input);
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
  const lock = await lockSkill(root, input.slug);
  let staging: string | undefined;
  let backup: string | undefined;
  let backupDirectory: string | undefined;
  try {
    const description = await describeDestination(destination, input.manifest, false);
    if (description.existing && !input.replace) targetExists(description);
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
      join(staging, installSourceFile),
      JSON.stringify(
        {
          ...input.source,
          slug: input.slug,
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

/** 删除结果：`removed` 是已删除的目录，预览时为将删除的目录。 */
export interface RemoveResult {
  dry_run: boolean;
  removed: string[];
  /** 加 force 删除时丢弃的本地差异。 */
  differences?: string[];
  /** 删除安装时保留的同名 `--replace` 备份。 */
  backups?: string[];
}

async function skillBackups(root: string, slug: string) {
  const name = new RegExp(`^\\.${slug}\\.backup-[A-Za-z0-9]{6}$`);
  const entries = await readdir(root, { withFileTypes: true }).catch(
    (error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return [];
      throw error;
    },
  );
  return entries
    .filter((entry) => entry.isDirectory() && name.test(entry.name))
    .map((entry) => join(root, entry.name))
    .sort(utf8Compare);
}

/**
 * 删除 `to/<slug>`：只处理带有效来源记录的安装，本地有差异时须 `force`。`backups` 改为只删除
 * `--replace` 留下的同名备份，不动当前安装。与同名安装互斥，路径不能经过链接；目录先移入隐藏
 * 暂存目录再删除，Agent 不会读到删了一半的 Skill。
 */
export async function remove(input: {
  slug: string;
  to: string;
  dryRun?: boolean;
  force?: boolean;
  backups?: boolean;
}): Promise<RemoveResult> {
  if (!assetSlugSchema.safeParse(input.slug).success) fail(422, 'INVALID_SLUG', '资产名称无效');
  const root = await safeDirectory(input.to, false);
  const dryRun = input.dryRun === true;
  const destination = join(root, input.slug);
  const describe = async (): Promise<RemoveResult> => {
    const backups = await skillBackups(root, input.slug);
    if (input.backups) return { dry_run: dryRun, removed: backups };
    if (!(await directoryExists(destination)))
      fail(404, 'INSTALL_NOT_FOUND', `未找到安装目录：${destination}`);
    const files = await recordedFiles(destination);
    if (typeof files === 'string')
      fail(422, 'INSTALL_UNVERIFIED', `${files}；CLI 只删除可验证的 Hub 安装，请手动核对后处理`);
    const differences = await localDiff(destination, files);
    if (differences.length && !input.force)
      fail(409, 'INSTALL_MODIFIED', `本地有修改，确认丢弃后加 --force：${differences.join('、')}`, {
        differences,
      });
    return {
      dry_run: dryRun,
      removed: [destination],
      ...(differences.length ? { differences } : {}),
      ...(backups.length ? { backups } : {}),
    };
  };
  const preview = await describe();
  if (dryRun || !preview.removed.length) return preview;
  const lock = await lockSkill(root, input.slug);
  try {
    // 检查与加锁之间目录可能被替换或修改，持锁后按同一规则复核。
    await safeDirectory(root, false);
    const result = await describe();
    for (const path of result.removed) {
      const trash = await mkdtemp(join(root, '.capability-hub-remove-'));
      try {
        await rename(path, join(trash, basename(path)));
      } finally {
        await rm(trash, { recursive: true, force: true });
      }
    }
    return result;
  } finally {
    await rm(lock, { recursive: true, force: true });
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

async function describeDestination<T extends boolean>(
  destination: string,
  manifest: Manifest,
  dryRun: T,
) {
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
