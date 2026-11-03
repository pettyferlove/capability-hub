import {
  SkeletonBlock,
  SkeletonRegion,
  SummaryPlaceholder,
  TableSkeleton,
} from '../../shared/components/Skeleton.js';
import { panelStyles } from '../../shared/styles/recipes.js';
import { analyticsSummaryStyles, operationsGridStyles } from './styles.js';
import { operationsCardsStyles } from './runtime/styles.js';
import { taskColumnStyles } from './agents/styles.js';
import { auditMetricsStyles } from './audit/styles.js';

function Metrics() {
  return (
    <div className={analyticsSummaryStyles}>
      {[0, 1, 2].map((i) => (
        <div key={i} className="grid gap-2">
          <SkeletonBlock width="48%" />
          <SkeletonBlock width="32%" height={25} />
        </div>
      ))}
    </div>
  );
}

function Chart({ height, withTotal = false }: { height: number; withTotal?: boolean }) {
  return (
    <div className="grid gap-3">
      <SkeletonBlock width="40%" height={16} />
      {withTotal && (
        <>
          <SkeletonBlock width="25%" height={24} />
          <SkeletonBlock width="60%" height={11} />
        </>
      )}
      <SkeletonBlock height={height} shape="rect" />
      <div className="flex justify-between">
        <SkeletonBlock width="20%" height={10} />
        <SkeletonBlock width="20%" height={10} />
      </div>
    </div>
  );
}

function SummaryCard({ rows, note = true }: { rows: number; note?: boolean }) {
  return (
    <section className={panelStyles}>
      <SummaryPlaceholder rows={rows} note={note} />
    </section>
  );
}

/** 三条趋势和各自的构成按所选时间范围一起返回。 */
export function OverviewSkeleton() {
  return (
    <SkeletonRegion label="正在读取资源趋势…">
      <div className="grid gap-4">
        <div className="grid gap-3 md:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div className={panelStyles} key={i}>
              <Chart height={64} withTotal />
            </div>
          ))}
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          {[2, 3, 4].map((rows) => (
            <SummaryCard key={rows} rows={rows} note={false} />
          ))}
        </div>
        <div className={panelStyles}>
          <SkeletonBlock width={108} />
        </div>
      </div>
    </SkeletonRegion>
  );
}

/** 范围切换器始终可用，只有汇总数值等待新快照。 */
export function TokenTotalsSkeleton() {
  return (
    <SkeletonRegion label="正在读取 Token 用量…">
      <div className="grid gap-3">
        <Metrics />
        <SkeletonBlock width="68%" />
        <SkeletonBlock width="40%" height={10} />
      </div>
    </SkeletonRegion>
  );
}

/** 趋势和分布依赖同一用量快照，两处都为首次读取预留空间。 */
export function TokenDetailsSkeleton() {
  return (
    <>
      <SkeletonRegion label="正在读取 Token 趋势…">
        <div className={panelStyles}>
          <Chart height={112} />
        </div>
      </SkeletonRegion>
      <div className={panelStyles}>
        <SkeletonRegion label="正在读取 Token 分布…">
          <div className="mb-3 flex items-center justify-between gap-3">
            <SkeletonBlock width={96} height={18} />
            <SkeletonBlock width={160} height={32} shape="rect" />
          </div>
        </SkeletonRegion>
        <TableSkeleton label="正在读取用量明细…" rows={4} columns={6} paginated />
      </div>
    </>
  );
}

/** 存储、指标和检查沿用真实布局顺序；分析页按趋势与注册信息上下排列。 */
export function SnapshotSkeleton({ section }: { section: 'runtime' | 'agents' }) {
  return (
    <SkeletonRegion
      label={section === 'runtime' ? '正在加载实例运行状态…' : '正在加载 Agent 运行分析…'}
    >
      <div className="grid gap-5">
        {section === 'runtime' ? (
          <>
            <div className={operationsGridStyles}>
              <SummaryCard rows={6} note={false} />
              <SummaryCard rows={6} note={false} />
            </div>
            <div className={operationsCardsStyles}>
              {[0, 1, 2].map((i) => (
                <div key={i}>
                  <SkeletonBlock width="44%" />
                  <SkeletonBlock width="36%" height={32} />
                  <SkeletonBlock width="72%" />
                </div>
              ))}
            </div>
            <div className={operationsGridStyles}>
              <SummaryCard rows={8} />
              <SummaryCard rows={8} />
            </div>
          </>
        ) : (
          <>
            <div className={panelStyles}>
              <div className="grid gap-4">
                <SkeletonBlock width={126} height={18} />
                <Metrics />
                <div className="grid gap-5 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                  <Chart height={96} />
                  <SummaryPlaceholder rows={3} note={false} />
                </div>
              </div>
            </div>
            <SummaryCard rows={4} />
          </>
        )}
      </div>
    </SkeletonRegion>
  );
}

/** 新建表单和只读详情在同一外框内切换，各自预留对应的正文宽度。 */
export function WorkspaceSkeleton({ creating }: { creating: boolean }) {
  return (
    <SkeletonRegion label={creating ? '正在加载新建任务…' : '正在加载执行详情…'}>
      <div className={creating ? taskColumnStyles : 'w-full px-5 sm:px-7'}>
        <div className="grid gap-4 py-6">
          <SkeletonBlock width="34%" height={22} />
          <SkeletonBlock width="66%" />
          {creating ? (
            <>
              <div className="grid gap-2.5 sm:grid-cols-2">
                {[0, 1, 2, 3].map((i) => (
                  <SkeletonBlock key={i} height={58} shape="rect" />
                ))}
              </div>
              <SkeletonBlock height={140} shape="rect" />
            </>
          ) : (
            <>
              <SkeletonBlock width="46%" height={32} shape="rect" />
              <SummaryPlaceholder rows={4} note={false} />
            </>
          )}
        </div>
      </div>
    </SkeletonRegion>
  );
}

/** 诊断快照独立于上方实时执行状态，单独占据事件区域。 */
export function DiagnosticsSkeleton() {
  return (
    <SkeletonRegion label="正在读取流程快照…">
      <div className="grid gap-5">
        <div className="grid gap-3 rounded-xl border border-line bg-page p-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="grid gap-2">
              <SkeletonBlock width="30%" height={10} />
              <SkeletonBlock width="65%" />
            </div>
          ))}
        </div>
        <SkeletonBlock width={128} height={36} shape="rect" />
        <SummaryPlaceholder rows={4} note={false} />
      </div>
    </SkeletonRegion>
  );
}

/** 审计总数和分类计数从同一结果读取，未返回时不展示零值。 */
export function AuditMetricsSkeleton() {
  return (
    <SkeletonRegion label="正在加载审计统计…">
      <div className={auditMetricsStyles}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i}>
            <SkeletonBlock width="46%" />
            <SkeletonBlock width="32%" height={32} />
            <SkeletonBlock width="76%" height={10} className="max-[600px]:hidden" />
          </div>
        ))}
      </div>
    </SkeletonRegion>
  );
}
