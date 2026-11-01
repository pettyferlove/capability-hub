import { constants } from 'node:fs';
import { chmod, lstat, open, rename, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { safeDirectory } from './filesystem.js';

/**
 * 以临时文件 + rename 原子写入私有 JSON：目录 0700、文件 0600，先 fsync 再替换，
 * 中途失败不会留下半写内容；已存在的目标必须是普通文件，符号链接直接拒绝。
 */
export async function savePrivateJson(path: string, value: unknown): Promise<void> {
  const directory = dirname(path);
  await safeDirectory(directory);
  const existing = await lstat(path).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  if (existing && !existing.isFile()) throw new Error('凭据文件不能为链接或特殊文件');
  await chmod(directory, 0o700);
  const temporary = join(directory, '.auth-' + randomUUID() + '.tmp');
  try {
    const file = await open(temporary, 'wx', 0o600);
    try {
      await file.writeFile(JSON.stringify(value));
      await file.sync();
    } finally {
      await file.close();
    }
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
}
/**
 * 用 `O_NOFOLLOW | O_NONBLOCK` 打开，拒绝链接、设备等非普通文件；要求组/其他位无权限
 * 且不超过 16 KiB，避免读到被替换或被恶意撑大的文件。
 */
export async function loadPrivateJson(path: string): Promise<unknown> {
  await safeDirectory(dirname(path), false);
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.mode & 0o077 || stat.size > 16384)
      throw new Error('凭据必须是私有普通文件，且不超过 16 KiB');
    return JSON.parse(await file.readFile('utf8')) as unknown;
  } finally {
    await file.close();
  }
}
