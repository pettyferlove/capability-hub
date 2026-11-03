import { Activity, Bot, Layers3, ScrollText, Workflow } from '../../shared/icons/lucide.js';
import { useHub } from '../../shared/context/HubContext.js';
import { canOpenOperations, operationsHref } from './navigation.js';
import { PageHead } from '../../shared/components/PageHead.js';
import { PageTabs } from '../../shared/components/PageTabs.js';
import { ErrorState } from '../../shared/components/ErrorState.js';
import { AgentSection } from './agents/AgentSection.js';
import { AuditPanel } from './audit/AuditPanel.js';
import { OperationsPanel } from './OperationsPanel.js';
import { TokenUsagePanel } from './usage/TokenUsagePanel.js';
import { ResourceOverview } from './overview/ResourceOverview.js';

/** 审计汇总和执行检查分别授权，进入子页时只挂载该页有权读取的数据。 */
export default function OperationsCenter({ query }: { query: string }) {
  const { me } = useHub();
  if (!canOpenOperations(me?.capabilities))
    return <ErrorState message="当前账号无权访问运营中心。" />;
  const canAudit = !!me?.capabilities.can_audit;
  const canInspect = !!me?.capabilities.can_ai_console;
  const requested = new URLSearchParams(query).get('tab') ?? (canAudit ? 'overview' : 'agents');
  const tabs = [
    ...(canAudit ? [{ id: 'overview' as const, label: '运营总览', Icon: Activity }] : []),
    { id: 'agents' as const, label: 'Agent', Icon: Bot },
    ...(canAudit
      ? [
          { id: 'usage' as const, label: 'Token 用量', Icon: Layers3 },
          { id: 'runtime' as const, label: '实例运行', Icon: Workflow },
          { id: 'audit' as const, label: '操作审计', Icon: ScrollText },
        ]
      : []),
  ];
  const tab = tabs.find((item) => item.id === requested)?.id;
  let panel;
  switch (tab) {
    case 'overview':
      panel = <ResourceOverview />;
      break;
    case 'agents':
      panel = <AgentSection query={query} canAudit={canAudit} canInspect={canInspect} />;
      break;
    case 'usage':
      panel = <TokenUsagePanel />;
      break;
    case 'runtime':
      panel = <OperationsPanel section="runtime" />;
      break;
    case 'audit':
      panel = <AuditPanel />;
      break;
    default:
      panel = <ErrorState message="当前账号无法访问此运营栏目。" />;
  }
  return (
    <div className="[&>nav]:mb-[var(--section-gap)] max-[600px]:[&>nav]:mb-[var(--space-4)]">
      <PageHead
        eyebrow="OPERATIONS"
        title="运营中心"
        description="查看资源发布、使用和反馈趋势，管理 Agent 执行、模型用量与实例运行。"
      />
      <PageTabs
        label="运营中心导航"
        value={tab ?? ''}
        items={tabs.map(({ id, label, Icon }) => ({
          id,
          label: (
            <>
              <Icon size={15} />
              {label}
            </>
          ),
        }))}
        hrefFor={(value) => operationsHref(value || 'overview')}
      />
      {panel}
    </div>
  );
}
