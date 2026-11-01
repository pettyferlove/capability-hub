import { blobReferences, parseSnapshot, restoreStore } from '@capability-hub/infrastructure/store';
import { sha256 } from '@capability-hub/domain/canonical';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { openOperations } from './runtime.js';

const source = resolve(process.argv[2] ?? '');
if (!process.argv[2]) throw new Error('请指定备份目录');

const manifest: unknown = JSON.parse(await readFile(join(source, 'backup.json'), 'utf8'));
if (
  !manifest ||
  typeof manifest !== 'object' ||
  !('schema' in manifest) ||
  manifest.schema !== 1 ||
  !('records_sha256' in manifest)
)
  throw new Error('备份清单无效');

const records = await readFile(join(source, 'records.json'));
if (sha256(records) !== manifest.records_sha256) throw new Error('备份记录摘要不匹配');

const snapshot = parseSnapshot(JSON.parse(records.toString()));
const runtime = await openOperations();
try {
  // 先校验所有引用对象再导入记录；失败时已写入对象仍不被业务记录引用。
  for (const hash of blobReferences(snapshot)) {
    const bytes = await readFile(join(source, 'blobs', hash));
    if (sha256(bytes) !== hash) throw new Error('备份对象摘要不匹配');
    await runtime.blobs.put(bytes);
  }
  await restoreStore(runtime.store, snapshot);
  process.stdout.write('已恢复当前初始化版本的记录与内容；请运行 restore:check 并核对实例密钥。\n');
} finally {
  await runtime.close();
}
