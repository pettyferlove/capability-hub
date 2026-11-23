import type { MeResponse } from '@capability-hub/contracts/http';

/** 仅用于提示当前账号是否属于申请受众，实际目录读取仍由服务端校验。 */
export function isInAudience(audience: readonly string[], me: Pick<MeResponse, 'id' | 'groups'>) {
  return audience.some(
    (id) =>
      id === 'public' ||
      id === 'organization' ||
      id === `principal:${me.id}` ||
      me.groups.some((group) => id === `group:${group.id}`),
  );
}

/** 受众变化的方向，不是精确差异：同一方向上不同的增减会得到同一个值，不能据此还原差集。 */
export type AudienceChange = 'unchanged' | 'expanded' | 'narrowed' | 'changed';

/** 公开和组织受众包含指定受众；指定对象之间只比较明确的集合关系。 */
export function audienceChange(
  previous: readonly string[],
  next: readonly string[],
): AudienceChange {
  const before = new Set(previous),
    after = new Set(next);
  if (before.size === after.size && [...before].every((id) => after.has(id))) return 'unchanged';
  // 顺序即优先级，不可交换：public 的收缩/扩张先于 organization，二者互换或一手撤
  // public、一手加 organization 都在这里就返回，不会落到下面的子集/超集比较与 changed。
  if (before.has('public')) return 'narrowed';
  if (after.has('public')) return 'expanded';
  if (before.has('organization')) return 'narrowed';
  if (after.has('organization')) return 'expanded';
  if ([...after].every((id) => before.has(id))) return 'narrowed';
  if ([...before].every((id) => after.has(id))) return 'expanded';
  return 'changed';
}
