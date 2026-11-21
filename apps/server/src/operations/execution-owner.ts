import type { RecordStore } from '@capability-hub/application/ports';

/** 首页匿名请求与后台任务不是用户账号。 */
export function reservedExecutionOwnerName(ownerId: string) {
  if (ownerId === 'anonymous') return '匿名访客';
  if (ownerId === 'system') return '系统任务';
}

/** 保留归属可辨认；只为用户账号查询当前显示名称。 */
export async function executionOwnerName(store: RecordStore, ownerId: string) {
  return (
    reservedExecutionOwnerName(ownerId) ??
    (await store.get('users', ownerId))?.display_name ??
    ownerId
  );
}
