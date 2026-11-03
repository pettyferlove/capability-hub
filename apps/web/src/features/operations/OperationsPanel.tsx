import { sectionHeadingStyles, subtleStyles, btnStyles } from '../../shared/styles/recipes.js';
import { operationsPanelStyles, operationsRevealStyles } from './styles.js';
import type { OperationsResponse } from '@capability-hub/contracts/http';
import type { ReactNode } from 'react';
import { RefreshCw } from '../../shared/icons/lucide.js';
import { useQuery } from '../../shared/api/use-query.js';
import { ErrorState } from '../../shared/components/ErrorState.js';
import { QueryRegion } from '../../shared/components/QueryRegion.js';
import { cn } from '../../shared/styles/cn.js';
import { SnapshotSkeleton } from './OperationsSkeleton.js';
import { useHub } from '../../shared/context/HubContext.js';
import { dateLabel } from '../../shared/format/labels.js';
import { OperationsAgents } from './agents/OperationsAgents.js';
import { OperationsAnalytics } from './agents/OperationsAnalytics.js';
import { InstanceRuntime } from './runtime/InstanceRuntime.js';

/**
 * 所有指标都取自同一份 `OperationsResponse` 快照，避免不同卡片之间出现时间错位；
 * 重取只由 {@link useHub} 的 `refresh` 变化触发，组件内没有定时器。
 */
export function OperationsPanel({
  section = 'runtime',
  viewSwitch,
}: {
  section?: 'runtime' | 'agents';
  viewSwitch?: ReactNode;
}) {
  const { refresh, reload } = useHub();
  const { data, error, loading } = useQuery<OperationsResponse>('/api/admin/operations', refresh);
  let content: ReactNode;
  if (error) {
    content = <ErrorState message={error} retry={reload} />;
  } else if (!data) {
    content = <SnapshotSkeleton section={section} />;
  } else if (section === 'agents') {
    content = (
      <>
        <OperationsAnalytics agents={data.agents} />
        <OperationsAgents agents={data.agents} workerState={data.worker_state} />
      </>
    );
  } else {
    content = <InstanceRuntime data={data} />;
  }
  return (
    <section className={operationsPanelStyles}>
      <div className={sectionHeadingStyles}>
        <div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h2>{section === 'agents' ? 'Agent 运行概况' : '实例运行状态'}</h2>
            {viewSwitch}
          </div>
          {data && !error && (
            <p className={subtleStyles}>
              最近采样 {dateLabel(data.observed_at)}
              {section === 'runtime' && ' · 请求统计从本次进程启动开始'}
            </p>
          )}
        </div>
        {!error && (
          <button className={btnStyles} disabled={loading} onClick={reload}>
            <RefreshCw size={14} />
            刷新
          </button>
        )}
      </div>
      <QueryRegion
        label={section === 'agents' ? 'Agent 运行结果' : '实例采样结果'}
        loading={loading}
        showProgress={!!data}
      >
        <div className={cn('grid min-w-0 gap-5', data && !error && operationsRevealStyles)}>
          {content}
        </div>
      </QueryRegion>
    </section>
  );
}
