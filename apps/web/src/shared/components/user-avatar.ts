/** 头像可选配色；`id` 会持久化到账号数据，改名会让既有头像失去配色，只能新增不能重命名。 */
export const avatarPalettes = [
  { id: 'teal', label: '鼠尾草', color: 'var(--avatar-teal)' },
  { id: 'blue', label: '雾蓝', color: 'var(--avatar-blue)' },
  { id: 'violet', label: '烟紫', color: 'var(--avatar-violet)' },
  { id: 'amber', label: '暖砂', color: 'var(--avatar-amber)' },
  { id: 'rose', label: '灰玫瑰', color: 'var(--avatar-rose)' },
] as const;

/** {@link avatarPalettes} 中存在的配色 id；用于校验账号里存下来的值而不必信任后端字段。 */
export type AvatarColor = (typeof avatarPalettes)[number]['id'];

/**
 * 账号标识决定左右对称点阵，不随名称、配色、主题和尺寸变化。
 * 输出 25 个布尔值（5 行 × 5 列，按行优先），每行至少亮一组点，保证小尺寸下仍有可辨识图案。
 */
export function avatarDesign(identity: string) {
  let state = 0x811c9dc5;
  for (const character of 'capability-hub/avatar/' + identity) {
    state ^= character.codePointAt(0)!;
    state = Math.imul(state, 0x01000193) >>> 0;
  }
  function pick(count: number) {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), state | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return Math.floor((((value ^ (value >>> 14)) >>> 0) / 0x100000000) * count);
  }
  // 每行至少亮起一组点，避免小尺寸下出现空白或过于稀疏的图案。
  const rows = Array.from({ length: 5 }, () => 1 + pick(7));
  return rows.flatMap((row) => [0, 1, 2, 1, 0].map((column) => ((row >>> column) & 1) === 1));
}
