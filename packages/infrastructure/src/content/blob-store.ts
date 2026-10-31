import { sha256 } from '@capability-hub/domain/canonical';
import { fail, HubError } from '@capability-hub/domain/errors';
import type { BlobStorage } from '@capability-hub/application/ports';
import { randomUUID } from 'node:crypto';
import { constants, lstatSync, mkdirSync } from 'node:fs';
import { link, open, readdir, lstat, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
/** 内容按摘要寻址且不可覆盖；硬链接保证并发写入时原子安装。 */
export class BlobStore implements BlobStorage {
  readonly kind = 'filesystem';
  constructor(public readonly root: string) {
    mkdirSync(root, { recursive: true, mode: 0o700 });
    if (!lstatSync(root).isDirectory()) fail(500, 'BLOB_DIRECTORY', '内容目录必须是普通目录');
  }
  private path(hash: string): string {
    if (!/^[a-f0-9]{64}$/.test(hash)) fail(500, 'BLOB_REFERENCE', '无效存储引用');
    return join(this.root, hash);
  }
  async put(bytes: Buffer): Promise<string> {
    const hash = sha256(bytes);
    const target = this.path(hash),
      temp = join(this.root, '.' + randomUUID());
    await writeFile(temp, bytes, { mode: 0o600, flag: 'wx' });
    try {
      try {
        await link(temp, target);
      } catch (error) {
        if (!(error && typeof error === 'object' && 'code' in error && error.code === 'EEXIST'))
          throw error;
      }
    } finally {
      await unlink(temp);
    }
    await this.read(hash);
    return hash;
  }
  async read(hash: string): Promise<Buffer> {
    let bytes: Buffer;
    try {
      const file = await open(
        this.path(hash),
        constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
      );
      try {
        if (!(await file.stat()).isFile()) fail(503, 'BLOB_CORRUPT', '内容对象必须是普通文件');
        bytes = await file.readFile();
      } finally {
        await file.close();
      }
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ELOOP')
        fail(503, 'BLOB_CORRUPT', '内容对象不能是符号链接');
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')
        fail(503, 'BLOB_MISSING', '内容暂不可用，请联系管理员');
      throw error;
    }
    if (sha256(bytes) !== hash) fail(503, 'BLOB_CORRUPT', '内容完整性校验失败');
    return bytes;
  }
  async exists(hash: string): Promise<boolean> {
    try {
      await this.read(hash);
      return true;
    } catch (error) {
      if (error instanceof HubError && ['BLOB_MISSING', 'BLOB_CORRUPT'].includes(error.code))
        return false;
      throw error;
    }
  }
  async health(): Promise<void> {
    await this.read(await this.put(Buffer.from('capability-hub-readiness')));
  }
  async *list() {
    for (const hash of await readdir(this.root)) {
      if (!/^[a-f0-9]{64}$/.test(hash)) continue;
      yield { hash, modifiedAt: (await lstat(this.path(hash))).mtimeMs };
    }
  }
  async remove(hash: string): Promise<void> {
    await unlink(this.path(hash));
  }
  async close(): Promise<void> {}
}
