import { parseRecord } from '@capability-hub/domain/models';
import type { StoreSnapshot } from './store-snapshot.js';
import { tables } from '../tables.js';
import { aiTables, parseAiRecord } from '@capability-hub/ai/records';

export function parseSnapshot(value: unknown): StoreSnapshot {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).length !== tables.length + aiTables.length
  )
    throw new Error('备份记录格式无效');
  const entries: [string, unknown][] = tables.map((table) => {
    const rows = (value as Record<string, unknown>)[table];
    if (!Array.isArray(rows)) throw new Error('备份记录格式无效');
    const parsed = (rows as unknown[]).map((row) => parseRecord(table, row));
    if (new Set(parsed.map((row) => row.id)).size !== parsed.length)
      throw new Error('备份包含重复记录');
    return [table, parsed];
  });
  for (const table of aiTables) {
    const rows = (value as Record<string, unknown>)[table];
    if (!Array.isArray(rows)) throw new Error('备份 AI 记录格式无效');
    const parsed = (rows as unknown[]).map((row) => parseAiRecord(table, row));
    if (new Set(parsed.map((row) => row.id)).size !== parsed.length)
      throw new Error('备份包含重复 AI 记录');
    entries.push([table, parsed]);
  }
  return Object.fromEntries(entries) as StoreSnapshot;
}
export function blobReferences(snapshot: Pick<StoreSnapshot, 'versions' | 'intakes'>): string[] {
  const references = [
    ...new Set([
      ...snapshot.versions.flatMap((version) => [
        version.manifest_ref,
        version.artifact_ref,
        ...version.files.map((file) => file.blob_ref),
      ]),
      ...snapshot.intakes.flatMap((intake) => (intake.payload_ref ? [intake.payload_ref] : [])),
    ]),
  ].sort();
  if (references.some((ref) => typeof ref !== 'string' || !/^[a-f0-9]{64}$/.test(ref)))
    throw new Error('备份存储引用无效');
  return references;
}
