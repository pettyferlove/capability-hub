import { unzip } from '@capability-hub/infrastructure/content/zip-archive';
import {
  assetSlugSchema,
  installSourceRecordSchema,
  manifestSchema,
  type InstallSourceRecord,
  type Manifest,
  type ManifestFile,
} from '@capability-hub/contracts';
import { canonical, digest, sha256, utf8Compare } from '@capability-hub/domain/canonical';
import { fail } from '@capability-hub/domain/errors';
import { executableText } from '@capability-hub/domain/files';
import {
  artifactPath,
  collisionKey,
  hasDirectoryCaseConflict,
  installSourceFile,
  safePath,
} from '@capability-hub/domain/paths';
import {
  lstat,
  mkdir,
  mkdtemp,
  open,
  readFile,
  readdir,
  readlink,
  rename,
  rm,
  rmdir,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import {
  assertSameDirectory,
  identifyDirectory,
  pinDirectory,
  safeDirectory,
  type DirectoryIdentity,
} from './filesystem.js';
import { hubUrl } from './credentials.js';
import { createHash } from 'node:crypto';
import { constants, type Stats } from 'node:fs';

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
  if (hasDirectoryCaseConflict(manifest.files))
    fail(422, 'MANIFEST_INVALID', '同一目录的拼写不一致');
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
export async function readSourceRecord(path: string) {
  const stat = await lstat(path, { bigint: true });
  if (!stat.isFile()) throw new Error('本地来源记录不是普通文件');
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const opened = await file.stat({ bigint: true });
    if (!opened.isFile() || opened.dev !== stat.dev || opened.ino !== stat.ino)
      throw new Error('本地来源记录发生变化');
    const bytes = await file.readFile();
    const encoding = bytes[0] === 0xff && bytes[1] === 0xfe ? 'utf-16le' : 'utf-8';
    const receipt = installSourceRecordSchema.parse(
      JSON.parse(new TextDecoder(encoding, { fatal: true }).decode(bytes)),
    );
    receipt.hub_url = hubUrl(receipt.hub_url);
    return receipt;
  } finally {
    await file.close();
  }
}

async function installationReceipt(directory: string) {
  try {
    return await readSourceRecord(join(directory, installSourceFile));
  } catch {
    return undefined;
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
  const expected = receiptFiles ?? (await installationReceipt(path))?.files;
  if (!expected) return ['目录不是已验证的 Hub 安装'];
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
  return identifyDirectory(lock);
}

async function assertWorkspace(root: DirectoryIdentity, lock?: DirectoryIdentity) {
  await safeDirectory(root.path, false);
  await assertSameDirectory(root);
  if (lock) await assertSameDirectory(lock);
}

async function cleanDirectory(
  root: DirectoryIdentity,
  directory: DirectoryIdentity,
  recursive = false,
) {
  try {
    await assertWorkspace(root);
    await assertSameDirectory(directory);
  } catch {
    // 原路径已不能证明归属，不触碰替代目录。
    return;
  }
  if (recursive) await rm(directory.path, { recursive: true });
  else await rmdir(directory.path);
}

async function withRelocatedDirectory<T>(
  root: DirectoryIdentity,
  lock: DirectoryIdentity,
  target: DirectoryIdentity,
  prefix: string,
  use: (
    relocated: DirectoryIdentity,
    assertLocation: (parent?: string) => Promise<void>,
    markDeleted: () => void,
  ) => Promise<T>,
) {
  await assertWorkspace(root, lock);
  const container = await identifyDirectory(await mkdtemp(join(root.path, prefix)));
  const path = join(container.path, basename(target.path));
  let relocated: DirectoryIdentity | undefined;
  let moved = false;
  let deleting = false;
  const assertLocation = async (parent = container.path) => {
    await safeDirectory(parent, false);
    await assertSameDirectory(root);
    await assertSameDirectory(lock);
    await assertSameDirectory(container);
    if (relocated) await assertSameDirectory(relocated);
  };
  try {
    await assertLocation();
    await assertSameDirectory(target);
    const handle = await pinDirectory(target);
    try {
      await rename(target.path, path);
      moved = true;
      await assertLocation();
      relocated = await identifyDirectory(path);
      const bound = (await handle?.stat({ bigint: true })) ?? target;
      if (
        relocated.dev !== target.dev ||
        relocated.dev !== bound.dev ||
        relocated.ino !== bound.ino
      )
        fail(409, 'INSTALL_TARGET_CHANGED', `目录在搬移期间发生变化：${target.path}`);
    } finally {
      await handle?.close();
    }
    const result = await use(relocated, assertLocation, () => {
      deleting = true;
    });
    if (deleting) moved = false;
    return result;
  } catch (error) {
    if (moved) {
      if (deleting || !relocated) {
        const reason = deleting ? '已删除部分条目，不恢复残缺目录' : '无法确认搬移后的目录身份';
        throw new AggregateError([error], `${reason}，请人工核对暂存位置：${path}`, {
          cause: error,
        });
      }
      try {
        await assertLocation();
        if (await directoryExists(target.path))
          throw new Error('恢复位置已被占用', { cause: error });
        await rename(path, target.path);
        moved = false;
      } catch (restoreError) {
        throw new AggregateError([error, restoreError], `操作中止，请人工核对暂存位置：${path}`, {
          cause: restoreError,
        });
      }
    }
    throw error;
  } finally {
    if (!moved) await cleanDirectory(root, container);
  }
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
  const files = await unzip(input.archive, 'release');
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
  const originalRoot = await identifyDirectory(root);
  const lock = await lockSkill(root, input.slug);
  let staging: DirectoryIdentity | undefined;
  let originalTarget: DirectoryIdentity | undefined;
  try {
    await assertWorkspace(originalRoot, lock);
    if (await directoryExists(destination)) {
      if (!input.replace)
        targetExists(await describeDestination(destination, input.manifest, false));
      originalTarget = await identifyDirectory(destination);
    }
    const initialFingerprint = originalTarget ? await directoryFingerprint(destination) : null;
    staging = await identifyDirectory(await mkdtemp(join(root, '.capability-hub-stage-')));
    for (const file of input.manifest.files) {
      const path = join(staging.path, file.path);
      await mkdir(dirname(path), { recursive: true, mode: 0o700 });
      await writeFile(path, files.find((entry) => entry.path === file.path)!.bytes, {
        mode: file.executable ? 0o700 : 0o600,
        flag: 'wx',
      });
    }
    await writeFile(
      join(staging.path, installSourceFile),
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
    await assertWorkspace(originalRoot, lock);
    await assertSameDirectory(staging);
    const stage = staging;
    const commitInstall = async (backup?: string): Promise<InstallResult> => {
      await assertWorkspace(originalRoot, lock);
      await assertSameDirectory(stage);
      if (await directoryExists(destination))
        fail(409, 'INSTALL_TARGET_CHANGED', '安装目标在准备期间发生变化，请检查后重试');
      await rename(stage.path, destination);
      staging = undefined;
      return { dry_run: false, destination, backup, files: input.manifest.files.length };
    };
    if (!originalTarget) return await commitInstall();
    return await withRelocatedDirectory(
      originalRoot,
      lock,
      originalTarget,
      `.${input.slug}.backup-`,
      async (backup, assertLocation) => {
        if ((await directoryFingerprint(backup.path)) !== initialFingerprint)
          fail(409, 'INSTALL_TARGET_CHANGED', '安装目标在准备期间发生变化，请检查后重试');
        await assertLocation();
        return commitInstall(backup.path);
      },
    );
  } finally {
    try {
      if (staging) await cleanDirectory(originalRoot, staging, true);
    } finally {
      await cleanDirectory(originalRoot, lock);
    }
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

async function discardDirectory(
  root: DirectoryIdentity,
  lock: DirectoryIdentity,
  target: DirectoryIdentity,
  fingerprint: string,
  receipt?: InstallSourceRecord,
) {
  await withRelocatedDirectory(
    root,
    lock,
    target,
    '.capability-hub-remove-',
    async (staged, assertLocation, markDeleted) => {
      if (
        receipt &&
        canonical((await installationReceipt(staged.path)) ?? null) !== canonical(receipt)
      )
        fail(409, 'INSTALL_TARGET_CHANGED', '待删除安装的来源记录发生变化');
      const entries: VerifiedEntry[] = [];
      if ((await directoryFingerprint(staged.path, entries)) !== fingerprint)
        fail(409, 'INSTALL_TARGET_CHANGED', '待删除内容发生变化，已停止删除');
      // 只处理刚核验的条目。新出现的文件让 rmdir 失败，不被递归删除。
      for (const { path, stat } of entries) {
        await assertLocation(dirname(path));
        const current = await lstat(path);
        if (
          current.dev !== stat.dev ||
          current.ino !== stat.ino ||
          current.mode !== stat.mode ||
          (!stat.isDirectory() && (current.size !== stat.size || current.mtimeMs !== stat.mtimeMs))
        )
          fail(409, 'INSTALL_TARGET_CHANGED', `待删除条目发生变化：${path}`);
        if (stat.isDirectory()) await rmdir(path);
        else await unlink(path);
        markDeleted();
      }
    },
  );
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
  if (!(await directoryExists(root))) {
    if (input.backups) return { dry_run: dryRun, removed: [] };
    fail(404, 'INSTALL_NOT_FOUND', `未找到安装目录：${destination}`);
  }
  const originalRoot = await identifyDirectory(root);
  const backups = await skillBackups(root, input.slug);
  const removed = input.backups ? backups : [destination];
  const result: RemoveResult = {
    dry_run: dryRun,
    removed,
    ...(!input.backups && backups.length ? { backups } : {}),
  };
  if (!removed.length) return result;
  if (!input.backups && !(await directoryExists(destination)))
    fail(404, 'INSTALL_NOT_FOUND', `未找到安装目录：${destination}`);
  const lock = dryRun ? undefined : await lockSkill(root, input.slug);
  const completed: string[] = [];
  try {
    const targets = [];
    for (const path of removed) {
      await assertWorkspace(originalRoot, lock);
      const target = await identifyDirectory(path);
      const receipt = input.backups ? undefined : await installationReceipt(path);
      if (!input.backups && !receipt)
        fail(422, 'INSTALL_UNVERIFIED', '目录不是已验证的 Hub 安装；请手动核对后处理');
      const fingerprint = lock ? await directoryFingerprint(path) : '';
      if (receipt) {
        const differences = await localDiff(path, receipt.files);
        if (differences.length && !input.force)
          fail(
            409,
            'INSTALL_MODIFIED',
            `本地有修改，确认丢弃后加 --force：${differences.join('、')}`,
            {
              differences,
            },
          );
        if (differences.length) result.differences = differences;
      }
      targets.push({ target, fingerprint, receipt });
    }
    if (lock) {
      for (const { target, fingerprint, receipt } of targets) {
        await discardDirectory(originalRoot, lock, target, fingerprint, receipt);
        completed.push(target.path);
      }
    }
    return result;
  } catch (error) {
    if (completed.length)
      throw new Error(
        `其余删除未完成；已删除：${completed.join('、')}。${error instanceof Error ? error.message : ''}`,
        { cause: error },
      );
    throw error;
  } finally {
    if (lock) await cleanDirectory(originalRoot, lock);
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

interface VerifiedEntry {
  path: string;
  stat: Stats;
}

async function directoryFingerprint(directory: string, entries?: VerifiedEntry[]): Promise<string> {
  const hash = createHash('sha256');
  async function walk(path: string, relative = ''): Promise<void> {
    const stat = await lstat(path);
    // 根目录身份单独核对，rename 也会改变根目录 ctime；子项身份、元数据和内容仍须一致。
    hash.update(
      JSON.stringify([
        relative,
        stat.dev,
        relative ? stat.ino : null,
        stat.mode,
        stat.size,
        stat.mtimeMs,
        relative ? stat.ctimeMs : null,
      ]),
    );
    if (stat.isSymbolicLink()) hash.update(await readlink(path));
    else if (stat.isDirectory()) {
      for (const name of (await readdir(path)).sort(utf8Compare))
        await walk(join(path, name), relative + '/' + name);
    } else if (stat.isFile()) {
      const file = await open(
        path,
        constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
      );
      try {
        const opened = await file.stat();
        if (!opened.isFile() || opened.dev !== stat.dev || opened.ino !== stat.ino)
          fail(409, 'INSTALL_TARGET_CHANGED', `读取期间文件发生变化：${path}`);
        for await (const bytes of file.createReadStream({ autoClose: false }))
          hash.update(bytes as Buffer);
      } finally {
        await file.close();
      }
    } else fail(422, 'INSTALL_PATH', '安装目标包含特殊文件');
    entries?.push({ path, stat });
  }
  await walk(directory);
  return hash.digest('hex');
}
