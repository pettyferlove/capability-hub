import { lstat } from 'node:fs/promises';
import { dirname } from 'node:path';
import lockfile from 'proper-lockfile';
import { safeDirectory } from './filesystem.js';

/** 心跳保持活跃锁；崩溃残留自动回收，正常网络超时不触发抢锁。 */
export async function withFileLock<T>(path: string, work: () => Promise<T>): Promise<T> {
  await safeDirectory(dirname(path));
  const existing = await lstat(path + '.lock').catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  if (existing && (!existing.isDirectory() || existing.isSymbolicLink()))
    throw new Error('锁路径不能是链接或特殊文件');
  const release = await lockfile.lock(path, {
    realpath: false,
    stale: 60000,
    update: 10000,
    retries: { retries: 65, factor: 1, minTimeout: 1000, maxTimeout: 1000, randomize: false },
  });
  try {
    return await work();
  } finally {
    await release();
  }
}
