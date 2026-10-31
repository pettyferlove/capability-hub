export const themePalettes = [
  { id: 'graphite', name: '石墨', description: '中性灰阶 · 钢蓝点缀' },
  { id: 'ocean', name: '海蓝', description: '冷白与岩灰 · 沉静蓝调' },
  { id: 'forest', name: '松绿', description: '雾白与苔灰 · 柔和绿调' },
  { id: 'sand', name: '暖砂', description: '米白与暖灰 · 陶土点缀' },
  { id: 'plum', name: '烟紫', description: '柔白与紫灰 · 灰紫点缀' },
] as const;

export type ThemePalette = (typeof themePalettes)[number]['id'];
export type ThemeMode = 'light' | 'dark' | 'system';
export type Appearance = { palette: ThemePalette; mode: ThemeMode };
export const appearanceStorageKey = 'capability-hub:appearance';
export const defaultAppearance: Appearance = { palette: 'graphite', mode: 'system' };

export function isThemePalette(value: unknown): value is ThemePalette {
  return themePalettes.some((palette) => palette.id === value);
}
export function isThemeMode(value: unknown): value is ThemeMode {
  return value === 'light' || value === 'dark' || value === 'system';
}

export function parseAppearance(value: string | null): Appearance {
  try {
    const parsed: unknown = JSON.parse(value ?? 'null');
    if (!parsed || typeof parsed !== 'object') return { ...defaultAppearance };
    return {
      palette:
        'palette' in parsed && isThemePalette(parsed.palette)
          ? parsed.palette
          : defaultAppearance.palette,
      mode: 'mode' in parsed && isThemeMode(parsed.mode) ? parsed.mode : defaultAppearance.mode,
    };
  } catch {
    return { ...defaultAppearance };
  }
}

export function readAppearance(): Appearance {
  try {
    return parseAppearance(window.localStorage.getItem(appearanceStorageKey));
  } catch {
    return { ...defaultAppearance };
  }
}

export function saveAppearance(value: Appearance): void {
  try {
    window.localStorage.setItem(appearanceStorageKey, JSON.stringify(value));
  } catch {
    // 存储被禁用时仍允许本次页面切换外观。
  }
}

export function applyAppearance(value: Appearance): boolean {
  const root = document.documentElement;
  root.setAttribute('data-palette', value.palette);
  if (value.mode === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', value.mode);
  const dark =
    value.mode === 'dark' ||
    (value.mode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  root.classList.toggle('dark', dark);
  root.classList.toggle('light', !dark);
  root.style.colorScheme = dark ? 'dark' : 'light';
  return dark;
}

export function initializeAppearance(): void {
  applyAppearance(readAppearance());
}
