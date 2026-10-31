import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BlobStore } from '@capability-hub/infrastructure/content';
import { sha256 } from '@capability-hub/domain/canonical';
import { HubError } from '@capability-hub/domain/errors';

test('文件内容并发写入使用同一摘要，损坏对象不能覆盖修复，链接对象无法读取', async (context) => {
  const root = await mkdtemp(join(tmpdir(), 'hub-blobs-'));
  context.after(() => rm(root, { recursive: true, force: true }));
  const blobs = new BlobStore(join(root, 'blobs'));
  const value = Buffer.from('immutable content');
  const hashes = await Promise.all(Array.from({ length: 8 }, () => blobs.put(value)));
  assert.equal(new Set(hashes).size, 1);
  assert.deepEqual(await blobs.read(hashes[0]), value);
  await writeFile(join(root, 'blobs', hashes[0]), 'corrupt');
  await assert.rejects(
    () => blobs.put(value),
    (error: unknown) => error instanceof HubError && error.code === 'BLOB_CORRUPT',
  );
  assert.equal(await readFile(join(root, 'blobs', hashes[0]), 'utf8'), 'corrupt');
  assert.equal(await blobs.exists(hashes[0]), false);
  const other = Buffer.from('outside content');
  await writeFile(join(root, 'outside'), other);
  await symlink(join(root, 'outside'), join(root, 'blobs', sha256(other)));
  await assert.rejects(
    () => blobs.read(sha256(other)),
    (error: unknown) => error instanceof HubError && error.code === 'BLOB_CORRUPT',
  );
  assert.equal(await blobs.exists('0'.repeat(64)), false);
});
