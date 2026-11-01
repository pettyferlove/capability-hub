import { useCallback, useEffect, useRef, useState } from 'react';
import {
  appearanceStorageKey,
  applyAppearance,
  isThemeMode,
  isThemePalette,
  parseAppearance,
  saveAppearance,
  type Appearance,
  type ThemeMode,
  type ThemePalette,
} from './appearance.js';

function currentAppearance(): Appearance {
  const root = document.documentElement;
  const palette = root.getAttribute('data-palette');
  const mode = root.getAttribute('data-theme');
  return {
    palette: isThemePalette(palette) ? palette : 'graphite',
    mode: isThemeMode(mode) ? mode : 'system',
  };
}

/**
 * 主题状态入口；初值取自 `<html>` 上已应用的属性而非重新读存储，保证与首屏
 * {@link initializeAppearance} 的结果一致，不会因为时序产生第二次切换。
 * 挂载期间跟随系统配色变化与跨标签页的 localStorage 变更，两者都只改界面不回写存储，
 * 避免两个标签页互相覆盖对方的偏好；连续切换以 ref 中的最新意图为准，跳过被取代的过渡。
 * 卸载时中断进行中的 View Transition，防止残留的过渡属性叠加到下一次切换。
 */
export function useTheme() {
  const [appearance, setAppearance] = useState(currentAppearance);
  const desired = useRef(appearance);
  const transition = useRef<ViewTransition | null>(null);

  const changeAppearance = useCallback((next: Appearance, persist = true) => {
    desired.current = next;
    transition.current?.skipTransition();
    const update = () => {
      // 连续选择只应用最后一次意图，跳过过渡不会取消旧的更新回调。
      if (desired.current !== next) return;
      applyAppearance(next);
      setAppearance(next);
      if (persist) saveAppearance(next);
    };
    if (
      !document.startViewTransition ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      update();
      return;
    }
    document.documentElement.setAttribute('data-theme-transition', '');
    const current = document.startViewTransition(update);
    transition.current = current;
    void current.ready.catch(() => {});
    const finish = () => {
      if (transition.current !== current) return;
      transition.current = null;
      document.documentElement.removeAttribute('data-theme-transition');
    };
    void current.finished.then(finish, finish);
  }, []);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const syncSystem = () => {
      if (desired.current.mode === 'system') changeAppearance({ ...desired.current }, false);
    };
    const syncStorage = (event: StorageEvent) => {
      if (event.key === appearanceStorageKey || event.key === null)
        changeAppearance(parseAppearance(event.newValue), false);
    };
    media.addEventListener('change', syncSystem);
    window.addEventListener('storage', syncStorage);
    return () => {
      media.removeEventListener('change', syncSystem);
      window.removeEventListener('storage', syncStorage);
      transition.current?.skipTransition();
    };
  }, [changeAppearance]);

  return {
    ...appearance,
    setMode: (mode: ThemeMode) => changeAppearance({ ...desired.current, mode }),
    setPalette: (palette: ThemePalette) => changeAppearance({ ...desired.current, palette }),
  };
}
