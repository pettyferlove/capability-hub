import { useCallback, useRef } from 'react';
import { ErrorState } from '../../../shared/components/ErrorState.js';
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

/** 执行检查和运行分析分别授权，带执行编号的链接只进入执行检查。 */
export function AgentSection({
  query,
  canInspect,
  canAudit,
}: {
  query: string;
  canInspect: boolean;
  canAudit: boolean;
}) {
  const params = new URLSearchParams(query);
  const explicitExecution = !!params.get('execution') || params.get('new') === '1';
  const analytics = !explicitExecution && (params.get('view') === 'analytics' || !canInspect);
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
  if (analytics && !canAudit) return <ErrorState message="当前账号无权查看 Agent 运行分析。" />;
  if (!analytics && !canInspect) return <ErrorState message="当前账号无权访问 Agent 执行记录。" />;
  const viewSwitch = canInspect && canAudit && (
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
    <AgentExecutions query={query} viewSwitch={viewSwitch} />
  );
}
