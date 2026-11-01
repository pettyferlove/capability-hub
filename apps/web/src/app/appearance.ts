/**
 * 配色方案清单；`id` 会写进 `data-palette` 并持久化到 localStorage，改名等于让既有用户的偏好失效。
 * 顺序即选择器里的展示顺序，首项 `graphite` 是默认值。
 */
export const themePalettes = [
  { id: 'graphite', name: '石墨', description: '中性灰阶 · 钢蓝点缀' },
  { id: 'ocean', name: '海蓝', description: '冷白与岩灰 · 沉静蓝调' },
  { id: 'forest', name: '松绿', description: '雾白与苔灰 · 柔和绿调' },
  { id: 'sand', name: '暖砂', description: '米白与暖灰 · 陶土点缀' },
  { id: 'plum', name: '烟紫', description: '柔白与紫灰 · 灰紫点缀' },
] as const;

/** `{@link themePalettes}` 里存在的配色 id；持久化数据必须经 {@link isThemePalette} 收窄后才能当它用。 */
export type ThemePalette = (typeof themePalettes)[number]['id'];
/** `system` 不落 `data-theme`，完全交给 `prefers-color-scheme`，因此会随后续系统切换变化。 */
export type ThemeMode = 'light' | 'dark' | 'system';
/** 外观偏好的完整快照；每个字段都可能来自不可信的存储值，读取时逐字段回退。 */
export type Appearance = { palette: ThemePalette; mode: ThemeMode };
/** localStorage 键名，线上已存在的值必须持续可解析，不能随意改名。 */
export const appearanceStorageKey = 'capability-hub:appearance';
/** 缺字段或字段非法时的兜底值；石墨 + 跟随系统。 */
export const defaultAppearance: Appearance = { palette: 'graphite', mode: 'system' };

/** 把 localStorage/JSON 里读到的 `unknown` 收窄成配色 id；非法值返回 `false` 而不是抛错。 */
export function isThemePalette(value: unknown): value is ThemePalette {
  return themePalettes.some((palette) => palette.id === value);
}
/** 同上，用于 `unknown` → {@link ThemeMode} 的收窄。 */
export function isThemeMode(value: unknown): value is ThemeMode {
  return value === 'light' || value === 'dark' || value === 'system';
}

/**
 * 解析存储串；任何形态的损坏（空值、非对象、字段类型不符、JSON 语法错误）都逐字段回退到默认值而不抛错。
 * 始终返回新对象，调用方就地改写不会污染 {@link defaultAppearance}。
 */
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

/** localStorage 不可用（隐私模式、被禁用的嵌入页）时返回默认值，不抛错。 */
export function readAppearance(): Appearance {
  try {
    return parseAppearance(window.localStorage.getItem(appearanceStorageKey));
  } catch {
    return { ...defaultAppearance };
  }
}

/** 写入失败（配额、隐私模式）被静默忽略：只影响下次打开，调用方不必回滚已应用的界面状态。 */
export function saveAppearance(value: Appearance): void {
  try {
    window.localStorage.setItem(appearanceStorageKey, JSON.stringify(value));
  } catch {
    // 存储被禁用时仍允许本次页面切换外观。
  }
}

/**
 * 把偏好落到 `<html>`：`data-palette`、`data-theme`、`light`/`dark` class 与 `color-scheme`
 * 必须一起改，只改一半会让原生控件与变量错色。
 * `mode: 'system'` 时移除 `data-theme`，由 CSS 的媒体查询自行判断，本函数此时不会再收到系统切换通知。
 *
 * @returns 该偏好最终呈现为深色与否，供需要同步 JS 侧颜色的调用方使用。
 */
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

/** 首屏渲染前调用一次，避免默认配色先闪一帧再切到用户偏好。 */
export function initializeAppearance(): void {
  applyAppearance(readAppearance());
}
