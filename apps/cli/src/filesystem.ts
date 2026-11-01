import { fail } from '@capability-hub/domain/errors';
import { lstat, mkdir, realpath } from 'node:fs/promises';
import { join, parse, resolve } from 'node:path';

/**
 * 逐级检查目录链：任一层是符号链接或普通文件即 422 `INSTALL_PATH`，防止写入被重定向到别处。
 * `create` 为 true 时按 0700 补建缺失目录并返回解析后的真实路径；为 false 时只校验、返回绝对路径。
 */
export async function safeDirectory(directory: string, create = true) {
  const absolute = resolve(directory);
  const root = parse(absolute).root;
  let current = root;
  for (const part of absolute.slice(root.length).split('/').filter(Boolean)) {
    current = join(current, part);
    try {
      const s = await lstat(current);
      if (s.isSymbolicLink() || !s.isDirectory())
        fail(422, 'INSTALL_PATH', '安装路径不可跨符号链接或普通文件');
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
      if (create) {
        try {
          await mkdir(current, { mode: 0o700 });
        } catch (error) {
          if (!(error && typeof error === 'object' && 'code' in error && error.code === 'EEXIST'))
            throw error;
        }
        const created = await lstat(current);
        if (!created.isDirectory() || created.isSymbolicLink())
          fail(422, 'INSTALL_PATH', '安装路径不可跨符号链接或普通文件');
      }
    }
  }
  return create ? realpath(absolute) : absolute;
}
