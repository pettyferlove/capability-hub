import { fail } from '@capability-hub/domain/errors';
import type { Stats } from 'node:fs';
import { lstat, mkdir, readlink, realpath } from 'node:fs/promises';
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
