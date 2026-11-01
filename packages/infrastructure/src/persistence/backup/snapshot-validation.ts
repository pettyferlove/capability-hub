import { parseRecord } from '@capability-hub/domain/models';
import type { StoreSnapshot } from './store-snapshot.js';
import { tables } from '../tables.js';
import { aiTables, parseAiRecord } from '@capability-hub/ai/records';

/**
 * 严格校验备份负载的形状后返回强类型快照，不做任何补全或字段丢弃。
 *
 * 要求表的集合与当前代码中的 {@link tables} + {@link aiTables} **完全一致**：多表、少表都会拒绝，
 * 因此跨版本备份不能直接恢复，必须先由升级路径转换。每行经 `parseRecord`/`parseAiRecord`
 * 逐字段校验，同表内 `id` 重复即报错。失败统一抛普通 `Error`（备份导入的错误码不含 HTTP 语义）。
 */
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
/**
 * 列出快照中所有会被引用的 blob 摘要（去重后按字典序），供备份导出前把内容一并打包、
 * 或恢复后校验对象存储是否齐备。
 *
 * 引用格式固定为小写 64 位十六进制 SHA-256；出现其它形态说明快照被篡改或来历不符，直接抛错。
 */
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
