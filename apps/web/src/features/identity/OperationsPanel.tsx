/**
 * 运维视角的实例运行状态：采样快照来自 `/api/admin/operations`，其中的请求统计只统计本次进程
 * 启动以来的量，不跨重启累计，所以重启后计数会归零；状态码在客户端聚合为成功（2xx/3xx）、
 * 拒绝（401/403）与失败（5xx）三类，其余状态不计入任何一类。
 */
import {
  formStackStyles,
  panelStyles,
  sectionHeadingStyles,
  subtleStyles,
  btnStyles,
} from '../../shared/styles/recipes.js';
import {
  operationsGridStyles,
  operationsPanelStyles,
  operationsCardsStyles,
  operationsFailuresStyles,
} from './styles.js';
import type { OperationsResponse } from '@capability-hub/contracts/http';
import { RefreshCw } from '../../shared/icons/lucide.js';
import { useQuery } from '../../shared/api/use-query.js';
import { ErrorState } from '../../shared/components/ErrorState.js';
import { CardGridSkeleton, SummarySkeleton } from '../../shared/components/Skeleton.js';
import { useHub } from '../../shared/context/HubContext.js';
import { bytesLabel, dateLabel } from '../../shared/format/labels.js';
import { OperationsAgents } from './OperationsAgents.js';
import { OperationsAnalytics } from './OperationsAnalytics.js';
import { OperationsStorage } from './OperationsStorage.js';

function p95Duration(http: OperationsResponse['http']) {
  if (!http.requests) return '—';
  const index = http.duration_buckets.findIndex(
    ({ cumulative }) => cumulative >= Math.ceil(http.requests * 0.95),
  );
  const bucket = http.duration_buckets[index];
  if (!bucket) return '—';
  if (bucket.upper_ms !== null) return `≤ ${bucket.upper_ms} ms`;
  const previous = http.duration_buckets[index - 1]?.upper_ms;
  return previous == null ? '—' : `> ${previous} ms`;
}

/**
 * 所有指标都取自同一份 `OperationsResponse` 快照，避免不同卡片之间出现时间错位；
 * 重取只由 {@link useHub} 的 `refresh` 变化触发，组件内没有定时器。
 */
export function OperationsPanel() {
  const { refresh, reload } = useHub();
  const { data, error, loading } = useQuery<OperationsResponse>('/api/admin/operations', refresh);
  if (error) return <ErrorState message={error} retry={reload} />;
  if (!data)
    return (
      <div className={formStackStyles}>
        <CardGridSkeleton label="正在加载实例运行状态…" count={3} variant="stat" />
        <div className={operationsGridStyles}>
          <section className={panelStyles}>
            <SummarySkeleton label="正在加载数据库与对象存储…" />
          </section>
          <section className={panelStyles}>
            <SummarySkeleton label="正在加载 Agent 运行状态…" />
          </section>
        </div>
      </div>
    );
  const { jobs, scans } = data;
  const statuses = data.http.by_status;
  const total = data.http.requests;
  const successful = Object.entries(statuses)
    .filter(([status]) => Number(status) >= 200 && Number(status) < 400)
    .reduce((sum, [, count]) => sum + Number(count), 0);
  const denied = (statuses['401'] ?? 0) + (statuses['403'] ?? 0);
  const failures = Object.entries(statuses)
    .filter(([status]) => Number(status) >= 500)
    .reduce((sum, [, count]) => sum + Number(count), 0);
  return (
    <section className={operationsPanelStyles}>
      <div className={sectionHeadingStyles}>
        <div>
          <h2>实例运行状态</h2>
          <p className={subtleStyles}>
            最近采样 {dateLabel(data.observed_at)} · 请求统计从本次进程启动开始
          </p>
        </div>
        <button className={btnStyles} disabled={loading} onClick={reload}>
          <RefreshCw size={14} />
          刷新
        </button>
      </div>
      <OperationsStorage data={data} />
      <OperationsAnalytics agents={data.agents} />
      <OperationsAgents agents={data.agents} workerState={data.worker_state} />
      <div className={operationsCardsStyles}>
        <div>
          <span>HTTP 请求</span>
          <strong>{total}</strong>
          <small>
            成功率 {total ? ((successful / total) * 100).toFixed(1) + '%' : '—'} · 平均{' '}
            {data.http.mean_duration_ms ?? '—'} ms
            <br />
            5xx {failures}
          </small>
        </div>
        <div>
          <span>等待 / 执行中的作业</span>
          <strong>
            {jobs ? (jobs.by_state.queued ?? 0) : '—'}
            <em>/ {jobs ? (jobs.by_state.running ?? 0) : '—'}</em>
          </strong>
          <small>
            {jobs
              ? `最长等待 ${jobs.oldest_wait_seconds} 秒 · 重试 ${jobs.retrying}`
              : '作业统计暂不可用'}
          </small>
        </div>
        <div>
          <span>实例数据目录可用磁盘</span>
          <strong>
            {data.disk.available ? ((data.disk.free_bytes ?? 0) / 1073741824).toFixed(1) : '不可用'}
            <em>{data.disk.available ? 'GiB' : ''}</em>
          </strong>
          <small>
            {data.disk.available && data.disk.total_bytes !== undefined
              ? `总容量 ${(data.disk.total_bytes / 1073741824).toFixed(1)} GiB`
              : '未取得磁盘容量'}
          </small>
        </div>
      </div>
      <div className={operationsGridStyles}>
        <section className={panelStyles}>
          <h3>请求与访问控制</h3>
          <dl>
            <div>
              <dt>统计起点</dt>
              <dd>{dateLabel(data.http.since)}</dd>
            </div>
            <div>
              <dt>P95 请求耗时（分桶）</dt>
              <dd>{p95Duration(data.http)}</dd>
            </div>
            <div>
              <dt>进程常驻内存</dt>
              <dd>{bytesLabel(data.memory_rss_bytes)}</dd>
            </div>
            <div>
              <dt>401 / 403</dt>
              <dd>{denied}</dd>
            </div>
            <div>
              <dt>429 限流</dt>
              <dd>{statuses['429'] ?? 0}</dd>
            </div>
            <div>
              <dt>身份刷新失败</dt>
              <dd>{data.http.errors.IDENTITY_REFRESH_FAILED ?? 0}</dd>
            </div>
            <div>
              <dt>内容缺失 / 损坏</dt>
              <dd>{(data.http.errors.BLOB_MISSING ?? 0) + (data.http.errors.BLOB_CORRUPT ?? 0)}</dd>
            </div>
            <div>
              <dt>处理中断</dt>
              <dd>{data.http.aborted}</dd>
            </div>
          </dl>
          <p className={subtleStyles}>仅汇总状态、耗时和错误码，不记录查询内容、请求正文或凭据。</p>
        </section>
        <section className={panelStyles}>
          <h3>处理与检查</h3>
          <dl>
            <div>
              <dt>已完成作业</dt>
              <dd>{jobs ? (jobs.by_state.succeeded ?? 0) : '—'}</dd>
            </div>
            <div>
              <dt>失败作业</dt>
              <dd>{jobs ? (jobs.by_state.failed ?? 0) : '—'}</dd>
            </div>
            <div>
              <dt>过期租约</dt>
              <dd>{jobs?.expired_leases ?? '—'}</dd>
            </div>
            <div>
              <dt>扫描阻断</dt>
              <dd>{scans ? (scans.by_state.blocked ?? 0) : '—'}</dd>
            </div>
            <div>
              <dt>规则集</dt>
              <dd>
                <code>{scans?.ruleset ?? '—'}</code>
              </dd>
            </div>
          </dl>
          <p className={subtleStyles}>扫描通过表示未发现当前规则的阻断项，仍需独立人工审核。</p>
        </section>
      </div>
      {jobs && jobs.recent_failures.length > 0 && (
        <section className={panelStyles}>
          <h3>最近失败作业</h3>
          <div className={operationsFailuresStyles}>
            {jobs.recent_failures.map((job, index: number) => (
              <div key={index}>
                <span>
                  {(
                    {
                      intake: '内容接收',
                      rescan: '重新扫描',
                      source_sync: '来源同步',
                      ai_execution: 'Agent 执行',
                    } as Record<string, string>
                  )[job.kind] ?? job.kind}
                </span>
                <code>{job.error_code ?? 'UNKNOWN'}</code>
                <small>{dateLabel(job.created_at)}</small>
              </div>
            ))}
          </div>
        </section>
      )}
    </section>
  );
}
