import { Archive, CheckCheck, Clock3, RotateCcw, TimerOff } from '../../shared/icons/lucide.js';
import { useLayoutEffect, useRef } from 'react';
import { pageHref, type PublicationStateFilter } from '../../shared/navigation/history-route.js';
import { cn } from '../../shared/styles/cn.js';

const statuses = [
  { id: 'pending', label: '待审核', icon: Clock3 },
  { id: 'approved', label: '已通过', icon: CheckCheck },
  { id: 'rejected', label: '已退回', icon: RotateCcw },
  { id: 'stale', label: '已失效', icon: TimerOff },
  { id: 'cancelled', label: '已撤回', icon: Archive },
] as const;

export function ReviewStatusTabs({
  state,
  count,
}: {
  state: PublicationStateFilter;
  count?: number;
}) {
  const navigation = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const nav = navigation.current;
    const active = nav?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!nav || !active) return;
    // 只移动状态条，浏览器后退和窄屏切换都不应带动整个页面滚动。
    const reveal = () => {
      const bounds = nav.getBoundingClientRect();
      const selected = active.getBoundingClientRect();
      if (selected.left < bounds.left) nav.scrollLeft -= bounds.left - selected.left;
      else if (selected.right > bounds.right) nav.scrollLeft += selected.right - bounds.right;
    };
    reveal();
    const observer = new ResizeObserver(reveal);
    observer.observe(nav);
    return () => observer.disconnect();
  }, [state, count]);

  return (
    <nav
      ref={navigation}
      aria-label="审核状态"
      className="max-w-full min-w-0 overflow-x-auto p-1 [scrollbar-width:thin]"
    >
      <div className="flex w-max min-w-full gap-1 rounded-2xl border border-line bg-paper p-1 shadow-[0_2px_8px_var(--shadow-color)]">
        {statuses.map(({ id, label, icon: Icon }) => {
          const active = state === id;
          return (
            <a
              key={id}
              href={pageHref('review', { state: id === 'pending' ? undefined : id })}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex min-h-10 min-w-25 shrink-0 items-center justify-center gap-2 rounded-xl px-3 text-body font-medium whitespace-nowrap transition-colors motion-reduce:transition-none',
                'focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand',
                active
                  ? 'bg-brand-soft text-brand shadow-[inset_0_0_0_1px_var(--line)]'
                  : 'text-muted-ink hover:bg-page hover:text-ink',
              )}
            >
              <Icon size={15} aria-hidden="true" className="shrink-0" />
              {label}
              {active && (
                <span
                  aria-label={count === undefined ? '记录数暂不可用' : `${count} 条记录`}
                  className="flex h-5 min-w-5 items-center justify-center rounded-md bg-paper px-1 text-caption tabular-nums"
                >
                  {count ?? '—'}
                </span>
              )}
            </a>
          );
        })}
      </div>
    </nav>
  );
}
