import {
  formStackStyles,
  panelStyles,
  sectionHeadingStyles,
  subtleStyles,
  btnStyles,
} from '../../shared/styles/recipes.js';
import { operationsGridStyles, operationsPanelStyles } from './styles.js';
import type { OperationsResponse } from '@capability-hub/contracts/http';
import { RefreshCw } from '../../shared/icons/lucide.js';
import { useQuery } from '../../shared/api/use-query.js';
import { ErrorState } from '../../shared/components/ErrorState.js';
import { CardGridSkeleton, SummarySkeleton } from '../../shared/components/Skeleton.js';
import { useHub } from '../../shared/context/HubContext.js';
import { dateLabel } from '../../shared/format/labels.js';
import { OperationsAgents } from './agents/OperationsAgents.js';
import { OperationsAnalytics } from './agents/OperationsAnalytics.js';
import { InstanceRuntime } from './runtime/InstanceRuntime.js';

/**
 * 所有指标都取自同一份 `OperationsResponse` 快照，避免不同卡片之间出现时间错位；
 * 重取只由 {@link useHub} 的 `refresh` 变化触发，组件内没有定时器。
 */
export function OperationsPanel({ section = 'runtime' }: { section?: 'runtime' | 'agents' }) {
  const { refresh, reload } = useHub();
  const { data, error, loading } = useQuery<OperationsResponse>('/api/admin/operations', refresh);
  if (error) return <ErrorState message={error} retry={reload} />;
  if (!data)
    return (
      <div className={formStackStyles}>
        <CardGridSkeleton
          label={section === 'agents' ? '正在加载 Agent 运行分析…' : '正在加载实例运行状态…'}
          count={3}
          variant="stat"
        />
        <div className={operationsGridStyles}>
          <section className={panelStyles}>
            <SummarySkeleton
              label={section === 'agents' ? '正在加载执行趋势…' : '正在加载数据库与对象存储…'}
            />
          </section>
          <section className={panelStyles}>
            <SummarySkeleton
              label={section === 'agents' ? '正在加载 Agent 注册信息…' : '正在加载作业与扫描…'}
            />
          </section>
        </div>
      </div>
    );
  const heading = (
    <div className={sectionHeadingStyles}>
      <div>
        <h2>{section === 'agents' ? 'Agent 运行概况' : '实例运行状态'}</h2>
        <p className={subtleStyles}>
          最近采样 {dateLabel(data.observed_at)}
          {section === 'runtime' && ' · 请求统计从本次进程启动开始'}
        </p>
      </div>
      <button className={btnStyles} disabled={loading} onClick={reload}>
        <RefreshCw size={14} />
        刷新
      </button>
    </div>
  );
  return (
    <section className={operationsPanelStyles}>
      {heading}
      {section === 'agents' ? (
        <>
          <OperationsAnalytics agents={data.agents} />
          <OperationsAgents agents={data.agents} workerState={data.worker_state} />
        </>
      ) : (
        <InstanceRuntime data={data} />
      )}
    </section>
  );
}
