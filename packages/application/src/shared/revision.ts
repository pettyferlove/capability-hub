import { fail } from '@capability-hub/domain/errors';
/** 变更必须匹配使用者读取时的修订号。 */
export function matchRevision(record: { revision: number }, etag: string | undefined): void {
  if (!etag) fail(428, 'IF_MATCH_REQUIRED', '请提供 If-Match 并发条件');
  if (etag !== `"${record.revision}"`)
    fail(412, 'REVISION_CONFLICT', '数据已变化，请刷新后重新操作');
}
