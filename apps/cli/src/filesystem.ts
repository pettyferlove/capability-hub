import { fail } from '@capability-hub/domain/errors';
import { constants, type Stats } from 'node:fs';
import { lstat, mkdir, open, readlink, realpath } from 'node:fs/promises';
import { join, parse, resolve, sep } from 'node:path';

/**
 * 逐级检查目录链：任一层是符号链接或普通文件即 422 `INSTALL_PATH`，防止写入被重定向到别处。
 * 根目录下的系统链接先由 {@link followSystemLink} 换成目标路径，目标路径同样逐级检查。
 * `create` 为 true 时按 0700 补建缺失目录并返回解析后的真实路径；为 false 时只校验，
 * 返回跟随系统链接后的绝对路径。
 */
export async function safeDirectory(directory: string, create = true) {
  const absolute = await followSystemLink(resolve(directory));
  const root = parse(absolute).root;
  let current = root;
  for (const part of absolute.slice(root.length).split(sep).filter(Boolean)) {
    current = join(current, part);
    try {
      requireDirectory(await lstat(current), current);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
      if (create) {
        try {
          await mkdir(current, { mode: 0o700 });
        } catch (error) {
          if (!(error && typeof error === 'object' && 'code' in error && error.code === 'EEXIST'))
            throw error;
        }
        requireDirectory(await lstat(current), current);
      }
    }
  }
  return create ? realpath(current) : current;
}

/** 路径可被外部进程替换；同时保存设备号和 inode，供提交及清理时核对。 */
export interface DirectoryIdentity {
  path: string;
  dev: bigint;
  ino: bigint;
}

/** 不跟随链接，记录实际被选中的目录而不是它的目标。 */
export async function identifyDirectory(path: string): Promise<DirectoryIdentity> {
  const stat = await lstat(path, { bigint: true });
  if (!stat.isDirectory()) fail(422, 'INSTALL_PATH', `目标不是普通目录：${path}`);
  return { path, dev: stat.dev, ino: stat.ino };
}

/** 部分卷在 rename 后重编目录号；先绑定打开的目录，搬移后可用同一描述符重新查询身份。 */
export async function pinDirectory(expected: DirectoryIdentity) {
  const handle = await open(
    expected.path,
    constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  ).catch((error: NodeJS.ErrnoException) => {
    if (['EISDIR', 'EPERM', 'EACCES', 'EINVAL', 'ENOTSUP'].includes(error.code ?? '')) return null;
    throw error;
  });
  if (!handle) return null;
  try {
    const stat = await handle.stat({ bigint: true });
    if (!stat.isDirectory() || stat.dev !== expected.dev || stat.ino !== expected.ino)
      fail(409, 'INSTALL_TARGET_CHANGED', `目录在操作期间发生变化：${expected.path}`);
    return handle;
  } catch (error) {
    await handle.close();
    throw error;
  }
}

/** 清理或提交前只接受该路径最后一次核验的目录。 */
export async function assertSameDirectory(expected: DirectoryIdentity) {
  const { path } = expected;
  const stat = await lstat(path, { bigint: true }).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  if (!stat?.isDirectory() || stat.dev !== expected.dev || stat.ino !== expected.ino)
    fail(409, 'INSTALL_TARGET_CHANGED', `目录在操作期间发生变化：${path}`);
}

/**
 * POSIX 根目录下由 root 拥有的链接（如 macOS 的 /tmp、/var）只跟随一跳：只有 root 能在根目录
 * 创建条目，项目文件和下载内容无法借此重定向写入。其他层级的链接仍由逐级检查拒绝。
 */
async function followSystemLink(absolute: string) {
  if (process.platform === 'win32') return absolute;
  const { root } = parse(absolute);
  const [first, ...rest] = absolute.slice(root.length).split(sep).filter(Boolean);
  if (!first) return absolute;
  const link = join(root, first);
  const entry = await lstat(link).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  if (!entry?.isSymbolicLink() || entry.uid !== 0) return absolute;
  return join(resolve(root, await readlink(link)), ...rest);
}

function requireDirectory(entry: Stats, path: string) {
  if (entry.isSymbolicLink()) fail(422, 'INSTALL_PATH', `目录路径不能经过符号链接：${path}`);
  if (!entry.isDirectory()) fail(422, 'INSTALL_PATH', `目录路径中的 ${path} 不是目录`);
}
