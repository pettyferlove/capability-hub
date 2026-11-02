/**
 * 审计事件工作台：数据来自 `/api/admin/audit`，关键词、分类、结果与时间范围组合后由服务端分页，
 * 翻页时保留上一页数据（`keepPreviousData`）避免表格闪空；关键词输入防抖 250ms 才触发查询。
 * 行与详情分别由 {@link AuditEventRow} 与 {@link AuditEventDetail} 渲染，原始记录只读不可改。
 */
import {
  auditCategoryIcons,
  auditResultIcons,
  timeRangeIcons,
} from '../../../shared/components/select-icons.js';
import {
  panelStyles,
  sectionHeadingStyles,
  subtleStyles,
  btnStyles,
  textBtnStyles,
  dataTableStyles,
  tableWrapStyles,
  tableCellStatusStyles,
  tableCellActionsStyles,
} from '../../../shared/styles/recipes.js';
import {
  auditPanelStyles,
  auditMetricsStyles,
  tnumStyles,
  hasFailuresStyles,
  auditFiltersStyles,
  auditSearchStyles,
  auditQueryCaptionStyles,
  auditTableStyles,
  auditEvidenceNoteStyles,
} from './styles.js';
import { cn } from '../../../shared/styles/cn.js';
import { auditCategories } from '@capability-hub/contracts';
import type { AuditEventResponse, AuditLogResponse } from '@capability-hub/contracts/http';
import {
  CircleAlert,
  Download,
  RefreshCw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  X,
} from '../../../shared/icons/lucide.js';
import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '../../../shared/api/use-query.js';
import { Empty } from '../../../shared/components/Empty.js';
import { ErrorState } from '../../../shared/components/ErrorState.js';
import { Overlay } from '../../../shared/components/Overlay.js';
import { SelectField } from '../../../shared/components/SelectField.js';
import { ServerPagination } from '../../../shared/components/ServerPagination.js';
import { TableSkeleton } from '../../../shared/components/Skeleton.js';
import { QueryRegion } from '../../../shared/components/QueryRegion.js';
import { useHub } from '../../../shared/context/HubContext.js';
import { AuditEventDetail, AuditEventRow } from './AuditEventDetail.js';

/**
 * 审计列表的筛选与分页状态都保存在本地 state，URL 不参与同步，刷新页面即回到默认筛选；
 * 「清空筛选」同时把页码重置为 1，避免停留在越界页。
 */
export function AuditPanel() {
  const { refresh, reload } = useHub();
  const [query, setQuery] = useState(''),
    [q, setQ] = useState('');
  const [category, setCategory] = useState('all'),
    [result, setResult] = useState('all');
  const [range, setRange] = useState('all'),
    [page, setPage] = useState(1),
    [pageSize, setPageSize] = useState(10);
  const [selected, setSelected] = useState<AuditEventResponse | null>(null);
  useEffect(() => {
    const timer = setTimeout(() => setQ(query.trim()), 250);
    return () => clearTimeout(timer);
  }, [query]);
  const interval = useMemo(() => {
    if (range === 'all') return {};
    const end = new Date();
    const start =
      range === 'today'
        ? new Date(new Date().setHours(0, 0, 0, 0))
        : new Date(end.getTime() - (range === '7d' ? 7 : 30) * 86400000);
    return { from: start.toISOString(), to: end.toISOString() };
  }, [range, refresh]);
  const params = new URLSearchParams({
    q,
    category,
    result,
    page: String(page),
    page_size: String(pageSize),
  });
  if (interval.from) params.set('from', interval.from);
  if (interval.to) params.set('to', interval.to);
  const { data, error, loading, isPreviousData } = useQuery<AuditLogResponse>(
    '/api/admin/audit?' + params.toString(),
    refresh,
    { keepPreviousData: true },
  );
  const filtered = !!query || category !== 'all' || result !== 'all' || range !== 'all';
  function clear() {
    setQuery('');
    setQ('');
    setCategory('all');
    setResult('all');
    setRange('all');
    setPage(1);
  }
  return (
    <section className={cn(panelStyles, auditPanelStyles)} aria-label="审计事件工作台">
      <div className={sectionHeadingStyles}>
        <div>
          <h2>审计事件</h2>
          <p className={subtleStyles}>追查谁对什么做了操作、结果如何，以及相关原因与变更。</p>
        </div>
        <button type="button" className={btnStyles} disabled={loading} onClick={reload}>
          <RefreshCw size={14} />
          刷新记录
        </button>
      </div>
      <div className={auditMetricsStyles} aria-label="当前筛选结果概览" aria-busy={loading}>
        <div>
          <span>匹配事件</span>
          <strong className={tnumStyles}>{data?.total ?? '—'}</strong>
          <small>全部符合条件的记录</small>
        </div>
        <div className={data?.summary.failures ? hasFailuresStyles : ''}>
          <span>
            <CircleAlert size={14} />
            操作失败
          </span>
          <strong className={tnumStyles}>{data?.summary.failures ?? '—'}</strong>
          <small>已记录的失败操作</small>
        </div>
        <div>
          <span>
            <ShieldCheck size={14} />
            账号与权限
          </span>
          <strong className={tnumStyles}>{data?.summary.identity ?? '—'}</strong>
          <small>登录、授权和账号变更</small>
        </div>
        <div>
          <span>
            <Download size={14} />
            资源下载
          </span>
          <strong className={tnumStyles}>{data?.summary.downloads ?? '—'}</strong>
          <small>已记录的下载请求</small>
        </div>
      </div>
      <div className={auditFiltersStyles}>
        <label className={auditSearchStyles}>
          <Search size={16} />
          <input
            type="search"
            aria-label="搜索审计事件"
            placeholder="搜索操作人、资源名称、事件或 ID…"
            value={query}
            maxLength={200}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
          />
        </label>
        <label>
          <span>
            <SlidersHorizontal size={13} />
            事件类型
          </span>
          <SelectField
            optionIcons={auditCategoryIcons}
            aria-label="事件类型"
            value={category}
            onValueChange={(value) => {
              setCategory(value);
              setPage(1);
            }}
          >
            <option value="all">全部类型</option>
            {Object.entries(auditCategories).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </SelectField>
        </label>
        <label>
          操作结果
          <SelectField
            optionIcons={auditResultIcons}
            aria-label="操作结果"
            value={result}
            onValueChange={(value) => {
              setResult(value);
              setPage(1);
            }}
          >
            <option value="all">全部结果</option>
            <option value="success">成功</option>
            <option value="failure">失败</option>
          </SelectField>
        </label>
        <label>
          时间范围
          <SelectField
            optionIcons={timeRangeIcons}
            aria-label="时间范围"
            value={range}
            onValueChange={(value) => {
              setRange(value);
              setPage(1);
            }}
          >
            <option value="all">全部时间</option>
            <option value="today">今天</option>
            <option value="7d">最近 7 天</option>
            <option value="30d">最近 30 天</option>
          </SelectField>
        </label>
      </div>
      <div className={auditQueryCaptionStyles}>
        <span>按时间倒序 · 精确到秒 · 统计随当前筛选更新</span>
        {filtered && (
          <button type="button" className={textBtnStyles} onClick={clear}>
            <X size={13} />
            清除筛选
          </button>
        )}
      </div>
      <QueryRegion label="审计查询结果" loading={loading} isPreviousData={isPreviousData}>
        {error && <ErrorState message={error} retry={reload} />}
        {!data && loading ? (
          <TableSkeleton label="正在加载审计事件…" rows={5} columns={6} />
        ) : data && !data.items.length ? (
          <Empty
            title={filtered ? '没有匹配的审计事件' : '尚无审计事件'}
            action={
              filtered ? (
                <button type="button" className={btnStyles} onClick={clear}>
                  清除筛选
                </button>
              ) : undefined
            }
          >
            {filtered
              ? '试试其他操作人、资源名称或时间范围。'
              : '已记录的登录、发布、资源访问和管理操作会出现在这里。'}
          </Empty>
        ) : (
          data && (
            <>
              <div className={cn(dataTableStyles, auditTableStyles)} aria-busy={loading}>
                <div
                  className={tableWrapStyles}
                  tabIndex={0}
                  role="region"
                  aria-label="审计事件表格"
                >
                  <table aria-label="审计事件">
                    <thead>
                      <tr>
                        <th>时间</th>
                        <th>事件与说明</th>
                        <th>操作身份</th>
                        <th>关联对象</th>
                        <th className={tableCellStatusStyles}>结果</th>
                        <th className={tableCellActionsStyles}>追查</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.items.map((event) => (
                        <AuditEventRow key={event.id} event={event} onOpen={setSelected} />
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <ServerPagination
                label="审计事件"
                page={data.page}
                pageSize={data.page_size}
                total={data.total}
                disabled={loading}
                onChange={(next, size) => {
                  setPage(next);
                  setPageSize(size);
                }}
              />
            </>
          )
        )}
      </QueryRegion>
      <p className={auditEvidenceNoteStyles}>
        <ShieldCheck size={14} />
        原始事件只追加、不可改写。名称、版本与说明用于阅读，详情保留排查所需标识。
      </p>
      <Overlay
        open={!!selected}
        onClose={() => setSelected(null)}
        label="审计事件详情"
        variant="sheet"
      >
        {selected && <AuditEventDetail event={selected} onClose={() => setSelected(null)} />}
      </Overlay>
    </section>
  );
}
