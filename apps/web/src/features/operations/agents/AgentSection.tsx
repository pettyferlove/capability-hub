import { useCallback, useRef } from 'react';
import { cn } from '../../../shared/styles/cn.js';
import { segmentedIndicatorStyles } from '../../../shared/styles/recipes.js';
import { operationsHref } from '../navigation.js';
import { OperationsPanel } from '../OperationsPanel.js';
import { AgentExecutions } from './AgentExecutions.js';
import { agentViewLinkStyles, agentViewSwitchStyles } from './styles.js';

const views = [
  { id: 'records', label: '执行记录', href: operationsHref('agents') },
  { id: 'analytics', label: '运行分析', href: operationsHref('agents', { view: 'analytics' }) },
] as const;

/** 两个已获授权的视图共用同一导航，只有两者均可访问时才显示切换器。 */
export function AgentSection({
  selected,
  creating,
  analytics,
  canSwitch,
}: {
  selected: string;
  creating: boolean;
  analytics: boolean;
  canSwitch: boolean;
}) {
  const retainFocus = useRef(false);
  const attachSwitch = useCallback((nav: HTMLElement | null) => {
    if (!nav) return;
    // 两个视图分别挂载标题，只接续离开视图时仍在切换器上的焦点。
    if (retainFocus.current && document.activeElement === document.body)
      nav.querySelector<HTMLAnchorElement>('[aria-current="page"]')?.focus({ preventScroll: true });
    retainFocus.current = false;
    return () => {
      retainFocus.current = nav.contains(document.activeElement);
    };
  }, []);
  const viewSwitch = canSwitch && (
    <nav ref={attachSwitch} className={agentViewSwitchStyles} aria-label="Agent 视图">
      {views.map(({ id, label, href }) => {
        const current = id === (analytics ? 'analytics' : 'records');
        return (
          <a
            key={id}
            href={href}
            aria-current={current ? 'page' : undefined}
            className={cn(agentViewLinkStyles, current && segmentedIndicatorStyles)}
          >
            {label}
          </a>
        );
      })}
    </nav>
  );
  return analytics ? (
    <OperationsPanel section="agents" viewSwitch={viewSwitch} />
  ) : (
    <AgentExecutions selected={selected} creating={creating} viewSwitch={viewSwitch} />
  );
}
