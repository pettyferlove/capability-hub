import {
  pageTabsStyles,
  tabLabelStyles,
  tabIndicatorStyles,
  activeStyles,
} from '../styles/recipes.js';
import { motion, useReducedMotion } from 'motion/react';
import { useId, useLayoutEffect, useRef, type ReactNode } from 'react';
import { spring } from '../motion/transitions.js';

interface TabItem<T extends string> {
  id: T;
  label: ReactNode;
}
interface PageTabsProps<T extends string> {
  items: TabItem<T>[];
  value: T;
  label: string;
  onValueChange?: (value: T) => void;
  hrefFor?: (value: T) => string;
  /** 本地标签关联面板；页面链接保持链接语义。 */
  panelId?: string;
}

/**
 * 横向标签条，两种形态：给 `hrefFor` 时渲染为链接（导航型，保持可中键/新标签打开），
 * 否则渲染为 `role="tablist"` 的本地切换并支持方向键/Home/End。
 * 选中项会被滚进可视区（只滚标签条自身，不带动页面），窗口尺寸变化时重新校正。
 * 本地形态的选中项必须由调用方同步到 `value`，组件自身不保存状态。
 */
export function PageTabs<T extends string>({
  items,
  value,
  label,
  onValueChange,
  hrefFor,
  panelId,
}: PageTabsProps<T>) {
  const indicatorId = useId();
  const tabId = panelId ?? indicatorId;
  const reduceMotion = useReducedMotion();
  const navigation = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const nav = navigation.current;
    if (!nav) return;
    const active = nav.querySelector<HTMLElement>('[aria-current=page], [aria-selected=true]');
    if (!active) return;
    const reveal = () => {
      const bounds = nav.getBoundingClientRect();
      const tab = active.getBoundingClientRect();
      const left = bounds.left + nav.clientLeft;
      const right = left + nav.clientWidth;
      // 仅滚动横向标签条，避免 scrollIntoView 连带移动页面。
      if (tab.left < left || tab.width > nav.clientWidth) nav.scrollLeft += tab.left - left;
      else if (tab.right > right) nav.scrollLeft += tab.right - right;
    };
    reveal();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(reveal);
    observer.observe(nav);
    observer.observe(active);
    return () => observer.disconnect();
  }, [value]);
  return (
    <nav
      ref={navigation}
      className={pageTabsStyles}
      aria-label={label}
      role={hrefFor ? undefined : 'tablist'}
    >
      {items.map((item, index) => {
        const active = value === item.id;
        const content = (
          <>
            <span className={tabLabelStyles}>{item.label}</span>
            {active && (
              <motion.span
                aria-hidden="true"
                className={tabIndicatorStyles}
                layoutId={indicatorId}
                transition={reduceMotion ? { duration: 0 } : spring}
              />
            )}
          </>
        );
        return hrefFor ? (
          <a
            key={item.id}
            href={hrefFor(item.id)}
            className={active ? activeStyles : ''}
            aria-current={active ? 'page' : undefined}
          >
            {content}
          </a>
        ) : (
          <button
            key={item.id}
            id={`${tabId}-tab-${item.id}`}
            type="button"
            role="tab"
            aria-selected={active}
            aria-controls={active && panelId ? `${panelId}-${item.id}` : undefined}
            tabIndex={active ? 0 : -1}
            className={active ? activeStyles : ''}
            onClick={() => onValueChange?.(item.id)}
            onKeyDown={(event) => {
              const next =
                event.key === 'Home'
                  ? 0
                  : event.key === 'End'
                    ? items.length - 1
                    : ['ArrowRight', 'ArrowDown'].includes(event.key)
                      ? (index + 1) % items.length
                      : ['ArrowLeft', 'ArrowUp'].includes(event.key)
                        ? (index - 1 + items.length) % items.length
                        : undefined;
              if (next === undefined) return;
              event.preventDefault();
              onValueChange?.(items[next].id);
              event.currentTarget.parentElement
                ?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
                ?.[next]?.focus();
            }}
          >
            {content}
          </button>
        );
      })}
    </nav>
  );
}
