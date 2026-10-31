import assert from 'node:assert/strict';
import type { RecordStore } from '@capability-hub/application/ports';

/** 同一套证据约束分别在 SQLite 和 PostgreSQL 实例上验证。 */
export async function assertFrozenEvidence(store: RecordStore, scanId: string, requestId: string) {
  const scan = await store.get('scans', scanId);
  const request = await store.get('requests', requestId);
  assert(scan && request);
  await assert.rejects(() => store.put('scans', { ...scan, findings: [] }), /immutable/);
  await assert.rejects(() => store.remove('scans', scan.id), /immutable/);
  await assert.rejects(
    () => store.put('requests', { ...request, applies_to: { keywords: ['修改冻结策略'] } }),
    /immutable/,
  );
  await assert.rejects(() => store.remove('requests', request.id), /immutable/);
  assert.deepEqual(await store.get('scans', scan.id), scan);
  assert.deepEqual(await store.get('requests', request.id), request);
}
