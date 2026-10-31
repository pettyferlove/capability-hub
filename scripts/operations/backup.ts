import { snapshotStore, blobReferences } from '@capability-hub/infrastructure/store';
import { sha256 } from '@capability-hub/domain/canonical';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { openOperations } from './runtime.js';
const dest = resolve(
  process.argv[2] ?? `output/backups/${new Date().toISOString().replace(/[:.]/g, '-')}`,
);
const runtime = await openOperations();
try {
  await mkdir(dirname(dest), { recursive: true, mode: 0o700 });
  await mkdir(dest, { mode: 0o700 });
  await mkdir(join(dest, 'blobs'), { mode: 0o700 });
  // 记录快照在同一事务内读取；内容块不可变，复制时无需继续占用事务。
  const snapshot = await snapshotStore(runtime.store);
  const records = Buffer.from(JSON.stringify(snapshot));
  await writeFile(join(dest, 'records.json'), records, { mode: 0o600, flag: 'wx' });
  const blobs = blobReferences(snapshot);
  for (const hash of blobs)
    await writeFile(join(dest, 'blobs', hash), await runtime.blobs.read(hash), {
      mode: 0o600,
      flag: 'wx',
    });
  await writeFile(
    join(dest, 'backup.json'),
    JSON.stringify(
      { schema: 1, created_at: new Date().toISOString(), records_sha256: sha256(records), blobs },
      null,
      2,
    ),
    { mode: 0o600, flag: 'wx' },
  );
  await runtime.store.audit('system', 'backup.completed', 'instance', '', {
    blob_count: blobs.length,
  });
  process.stdout.write(dest + '\n');
} finally {
  await runtime.close();
}
