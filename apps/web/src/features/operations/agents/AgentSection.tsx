import { ErrorState } from '../../../shared/components/ErrorState.js';
import { PageTabs } from '../../../shared/components/PageTabs.js';
import { operationsHref } from '../navigation.js';
import { OperationsPanel } from '../OperationsPanel.js';
import { AgentExecutions } from './AgentExecutions.js';

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
  if (analytics && !canAudit) return <ErrorState message="当前账号无权查看 Agent 运行分析。" />;
  if (!analytics && !canInspect) return <ErrorState message="当前账号无权访问 Agent 执行记录。" />;
  return (
    <>
      {canInspect && canAudit && (
        <PageTabs
          label="Agent 导航"
          value={analytics ? 'analytics' : 'records'}
          items={[
            { id: 'records', label: '执行记录' },
            { id: 'analytics', label: '运行分析' },
          ]}
          hrefFor={(value) =>
            operationsHref('agents', { view: value === 'analytics' ? 'analytics' : undefined })
          }
        />
      )}
      {analytics ? <OperationsPanel section="agents" /> : <AgentExecutions query={query} />}
    </>
  );
}
