import { lazy, Suspense, type ReactNode } from 'react';
import { Activity, Bot, Layers3, ScrollText, Workflow } from '../../shared/icons/lucide.js';
import { useHub } from '../../shared/context/HubContext.js';
import { canOpenOperations, operationsHref } from './navigation.js';
import { PageHead } from '../../shared/components/PageHead.js';
import { PageTabs } from '../../shared/components/PageTabs.js';
import { ErrorState } from '../../shared/components/ErrorState.js';
import {
  AuditMetricsSkeleton,
  OverviewSkeleton,
  SnapshotSkeleton,
  TokenDetailsSkeleton,
  TokenTotalsSkeleton,
  WorkspaceSkeleton,
} from './OperationsSkeleton.js';
import { SkeletonBlock, SkeletonRegion, TableSkeleton } from '../../shared/components/Skeleton.js';
import { panelStyles, formStackStyles } from '../../shared/styles/recipes.js';

const Overview = lazy(async () => ({
  default: (await import('./overview/ResourceOverview.js')).ResourceOverview,
}));
const Usage = lazy(async () => ({
  default: (await import('./usage/TokenUsagePanel.js')).TokenUsagePanel,
}));
const Snapshot = lazy(async () => ({
  default: (await import('./OperationsPanel.js')).OperationsPanel,
}));
const Audit = lazy(async () => ({ default: (await import('./audit/AuditPanel.js')).AuditPanel }));
const Agents = lazy(async () => ({
  default: (await import('./agents/AgentSection.js')).AgentSection,
}));

function HeadingPlaceholder({ title }: { title: string }) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-section">{title}</h2>
      <div className="w-28">
        <SkeletonRegion label="正在加载面板控件…">
          <SkeletonBlock height={36} shape="rect" />
        </SkeletonRegion>
      </div>
    </div>
  );
}

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
  let panel: ReactNode;
  let placeholder: ReactNode;
  switch (tab) {
    case 'overview':
      panel = <Overview />;
      placeholder = (
        <>
          <HeadingPlaceholder title="资源运营概览" />
          <OverviewSkeleton />
        </>
      );
      break;
    case 'agents': {
      const params = new URLSearchParams(query);
      const selected = params.get('execution') ?? '';
      const newTask = params.get('new') === '1';
      const analytics =
        !selected && !newTask && (params.get('view') === 'analytics' || !canInspect);
      if (analytics && !canAudit) {
        panel = <ErrorState message="当前账号无权查看 Agent 运行分析。" />;
        break;
      }
      if (!analytics && !canInspect) {
        panel = <ErrorState message="当前账号无权访问 Agent 执行记录。" />;
        break;
      }
      const creating = !selected && newTask && !!me?.capabilities.can_ai;
      panel = (
        <Agents
          analytics={analytics}
          canSwitch={canInspect && canAudit}
          selected={selected}
          creating={creating}
        />
      );
      placeholder = (
        <div className="grid gap-5">
          <SkeletonRegion label="正在加载 Agent 视图…">
            <SkeletonBlock width={192} height={36} shape="rect" />
          </SkeletonRegion>
          {analytics ? (
            <SnapshotSkeleton section="agents" />
          ) : creating || selected ? (
            <WorkspaceSkeleton creating={creating} />
          ) : (
            <TableSkeleton label="正在加载执行记录…" columns={6} paginated />
          )}
        </div>
      );
      break;
    }
    case 'usage':
      panel = <Usage />;
      placeholder = (
        <div className={formStackStyles}>
          <div className={panelStyles}>
            <HeadingPlaceholder title="项目 Token 用量" />
            <TokenTotalsSkeleton />
          </div>
          <TokenDetailsSkeleton />
        </div>
      );
      break;
    case 'runtime':
      panel = <Snapshot section="runtime" />;
      placeholder = (
        <>
          <HeadingPlaceholder title="实例运行状态" />
          <SnapshotSkeleton section="runtime" />
        </>
      );
      break;
    case 'audit':
      panel = <Audit />;
      placeholder = (
        <div className={panelStyles}>
          <div className={formStackStyles}>
            <HeadingPlaceholder title="审计事件" />
            <AuditMetricsSkeleton />
            <TableSkeleton label="正在加载审计事件…" columns={6} paginated stackOnMobile />
          </div>
        </div>
      );
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
      <Suspense key={tab} fallback={placeholder}>
        {panel}
      </Suspense>
    </div>
  );
}
