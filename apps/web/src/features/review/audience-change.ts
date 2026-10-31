export type AudienceChange = 'unchanged' | 'expanded' | 'narrowed' | 'changed';

/** 公开和组织受众包含指定受众；指定对象之间只比较明确的集合关系。 */
export function audienceChange(
  previous: readonly string[],
  next: readonly string[],
): AudienceChange {
  const before = new Set(previous),
    after = new Set(next);
  if (before.size === after.size && [...before].every((id) => after.has(id))) return 'unchanged';
  if (before.has('public')) return 'narrowed';
  if (after.has('public')) return 'expanded';
  if (before.has('organization')) return 'narrowed';
  if (after.has('organization')) return 'expanded';
  if ([...after].every((id) => before.has(id))) return 'narrowed';
  if ([...before].every((id) => after.has(id))) return 'expanded';
  return 'changed';
}
