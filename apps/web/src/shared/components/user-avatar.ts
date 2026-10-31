export const avatarPalettes = [
  {
    id: 'teal',
    label: '松石绿',
    background: 'var(--avatar-teal-background)',
    glow: 'var(--avatar-teal-glow)',
    shell: 'var(--avatar-teal-shell)',
    shade: 'var(--avatar-teal-shade)',
    suit: 'var(--avatar-teal-suit)',
    visor: 'var(--avatar-teal-visor)',
    light: 'var(--avatar-teal-light)',
    accents: [
      'var(--avatar-teal-accent-0)',
      'var(--avatar-teal-accent-1)',
      'var(--avatar-teal-accent-2)',
    ],
  },
  {
    id: 'blue',
    label: '湖蓝',
    background: 'var(--avatar-blue-background)',
    glow: 'var(--avatar-blue-glow)',
    shell: 'var(--avatar-blue-shell)',
    shade: 'var(--avatar-blue-shade)',
    suit: 'var(--avatar-blue-suit)',
    visor: 'var(--avatar-blue-visor)',
    light: 'var(--avatar-blue-light)',
    accents: [
      'var(--avatar-blue-accent-0)',
      'var(--avatar-blue-accent-1)',
      'var(--avatar-blue-accent-2)',
    ],
  },
  {
    id: 'violet',
    label: '紫罗兰',
    background: 'var(--avatar-violet-background)',
    glow: 'var(--avatar-violet-glow)',
    shell: 'var(--avatar-violet-shell)',
    shade: 'var(--avatar-violet-shade)',
    suit: 'var(--avatar-violet-suit)',
    visor: 'var(--avatar-violet-visor)',
    light: 'var(--avatar-violet-light)',
    accents: [
      'var(--avatar-violet-accent-0)',
      'var(--avatar-violet-accent-1)',
      'var(--avatar-violet-accent-2)',
    ],
  },
  {
    id: 'amber',
    label: '琥珀',
    background: 'var(--avatar-amber-background)',
    glow: 'var(--avatar-amber-glow)',
    shell: 'var(--avatar-amber-shell)',
    shade: 'var(--avatar-amber-shade)',
    suit: 'var(--avatar-amber-suit)',
    visor: 'var(--avatar-amber-visor)',
    light: 'var(--avatar-amber-light)',
    accents: [
      'var(--avatar-amber-accent-0)',
      'var(--avatar-amber-accent-1)',
      'var(--avatar-amber-accent-2)',
    ],
  },
  {
    id: 'rose',
    label: '玫瑰',
    background: 'var(--avatar-rose-background)',
    glow: 'var(--avatar-rose-glow)',
    shell: 'var(--avatar-rose-shell)',
    shade: 'var(--avatar-rose-shade)',
    suit: 'var(--avatar-rose-suit)',
    visor: 'var(--avatar-rose-visor)',
    light: 'var(--avatar-rose-light)',
    accents: [
      'var(--avatar-rose-accent-0)',
      'var(--avatar-rose-accent-1)',
      'var(--avatar-rose-accent-2)',
    ],
  },
] as const;

export type AvatarColor = (typeof avatarPalettes)[number]['id'];

/** 账号标识决定头像图案，不随名称、主题和尺寸变化。 */
export function avatarDesign(identity: string) {
  let state = 0x811c9dc5;
  for (const character of 'capability-hub/portrait/' + identity) {
    state ^= character.codePointAt(0)!;
    state = Math.imul(state, 0x01000193) >>> 0;
  }
  function pick(count: number) {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), state | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return Math.floor((((value ^ (value >>> 14)) >>> 0) / 0x100000000) * count);
  }
  return {
    tilt: pick(9) - 4,
    headWidth: 48 + pick(5) * 2,
    headRadius: 12 + pick(5),
    eye: pick(4),
    eyeGap: 16 + pick(4) * 2,
    mouth: pick(4),
    antenna: pick(4),
    ears: pick(3),
    badge: pick(3),
    accent: pick(3),
    orbit: pick(8) * 45,
    mirrored: pick(2) === 1,
  };
}
