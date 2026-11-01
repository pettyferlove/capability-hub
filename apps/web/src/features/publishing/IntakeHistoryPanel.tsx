import { intakeStatusIcons } from '../../shared/components/select-icons.js';
import {
  panelStyles,
  panelHeadingStyles,
  stepNumberStyles,
  countPillStyles,
  textBtnStyles,
  btnStyles,
  eyebrowStyles,
  iconBtnStyles,
} from '../../shared/styles/recipes.js';
import {
  intakeHistoryPanelStyles,
  intakeHistoryFiltersStyles,
  intakeHistorySearchStyles,
  intakeHistoryScrollStyles,
  intakeListFootStyles,
  publishIntakeHeaderStyles,
  publishIntakeBodyStyles,
} from './styles.js';
import { cn } from '../../shared/styles/cn.js';
import { intakeStatuses } from '@capability-hub/contracts';
import type { IntakeListResponse } from '@capability-hub/contracts/http';
import { RefreshCw, Search, ShieldCheck, X } from '../../shared/icons/lucide.js';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useQuery } from '../../shared/api/use-query.js';
import { Empty } from '../../shared/components/Empty.js';
import { ErrorState } from '../../shared/components/ErrorState.js';
import { Loading } from '../../shared/components/Loading.js';
import { Message } from '../../shared/components/Message.js';
import { Overlay } from '../../shared/components/Overlay.js';
import { SelectField } from '../../shared/components/SelectField.js';
import { ServerPagination } from '../../shared/components/ServerPagination.js';
import { ListSkeleton } from '../../shared/components/Skeleton.js';
import { QueryRegion } from '../../shared/components/QueryRegion.js';
import { useHub } from '../../shared/context/HubContext.js';
import { useIntakeDetail } from './use-intake-detail.js';
import { IntakeDetail } from './IntakeDetail.js';
import type { ReviewOrigin } from '../ai/quick-review.js';
import type { AuditSuggestion } from '../ai/publication-suggestion.js';
import { BusinessAgentPanel } from '../ai/BusinessAgentPanel.js';
import { IntakeHistoryRow, statusLabels } from './IntakeHistoryRow.js';

export function IntakeHistoryPanel({
  active,
  onSelect,
}: {
  active: string;
  onSelect: (id: string) => void;
}) {
  const { refresh, reload, me } = useHub();
  const [suggestion, setSuggestion] = useState<AuditSuggestion>();
  const [footerSlot, setFooterSlot] = useState<HTMLDivElement | null>(null);
  const [origin, setOrigin] = useState<ReviewOrigin>();
  useEffect(() => setOrigin(undefined), [active]);
  const [query, setQuery] = useState('');
  const [listRefresh, setListRefresh] = useState(0);
  const [filters, setFilters] = useState({ page: 1, pageSize: 5, q: '', state: 'all' });
  const list = useRef<HTMLDivElement>(null);
  const params = new URLSearchParams({
    page: String(filters.page),
    page_size: String(filters.pageSize),
    q: filters.q,
    state: filters.state,
  });
  const { data, error, loading, isPreviousData } = useQuery<IntakeListResponse>(
    '/api/intakes?' + params.toString(),
    refresh + listRefresh,
    { keepPreviousData: true },
  );
  const {
    data: detail,
    error: detailError,
    loading: detailLoading,
    connection,
  } = useIntakeDetail(active, refresh);
  const pending =
    !!data?.processing_total ||
    (!!detail && ['received', 'fetching', 'scanning'].includes(detail.state));
  const [background, setBackground] = useState(false);
  useEffect(() => {
    setBackground(false);
    if (!pending) return;
    const started = Date.now();
    const timer = setInterval(() => {
      if (Date.now() - started > 120000) {
        setBackground(true);
        clearInterval(timer);
      } else setListRefresh((value) => value + 1);
    }, 2000);
    return () => clearInterval(timer);
  }, [pending]);
  useEffect(() => {
    if (list.current) list.current.scrollTop = 0;
  }, [filters]);
  function search(event: FormEvent) {
    event.preventDefault();
    setFilters((value) => ({ ...value, page: 1, q: query.trim() }));
  }
  return (
    <section className={cn(panelStyles, intakeHistoryPanelStyles)} aria-busy={loading}>
      <div className={panelHeadingStyles}>
        <span className={stepNumberStyles}>02</span>
        <div>
          <h2>接收记录 {data && <span className={countPillStyles}>{data.total}</span>}</h2>
          <p>按内容识别版本，查看处理结果与下一步。</p>
        </div>
        <button type="button" className={textBtnStyles} onClick={reload}>
          <RefreshCw size={14} />
          刷新
        </button>
      </div>
      <form className={intakeHistoryFiltersStyles} onSubmit={search}>
        <label className={intakeHistorySearchStyles}>
          <Search size={15} aria-hidden="true" />
          <input
            type="search"
            aria-label="搜索接收记录"
            placeholder="搜索资产、版本或类型…"
            maxLength={200}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <button type="submit" className={btnStyles}>
          搜索
        </button>
        <SelectField
          optionIcons={intakeStatusIcons}
          aria-label="接收记录状态"
          value={filters.state}
          onValueChange={(state) => setFilters((value) => ({ ...value, page: 1, state }))}
        >
          <option value="all">全部状态</option>
          {intakeStatuses.map((state) => (
            <option key={state} value={state}>
              {statusLabels[state]}
              {data ? ` (${data.counts[state] ?? 0})` : ''}
            </option>
          ))}
        </SelectField>
      </form>
      {background && <Message>处理仍在后台继续，稍后刷新查看结果。</Message>}
      <QueryRegion label="接收记录查询结果" loading={loading} isPreviousData={isPreviousData}>
        {error ? (
          <ErrorState message={error} retry={reload} />
        ) : !data ? (
          <ListSkeleton label="正在加载接收记录…" rows={5} />
        ) : !data.items.length ? (
          <Empty title={filters.q || filters.state !== 'all' ? '没有匹配的记录' : '还没有接收记录'}>
            上传后的处理结果会保存在这里，可按资产和状态查找。
          </Empty>
        ) : (
          <div
            className={intakeHistoryScrollStyles}
            ref={list}
            tabIndex={0}
            role="region"
            aria-label="接收记录列表"
          >
            {data.items.map((item) => (
              <IntakeHistoryRow
                key={item.id}
                item={item}
                active={active === item.id}
                onSelect={onSelect}
              />
            ))}
          </div>
        )}
        {data && (
          <ServerPagination
            label="接收记录"
            page={data.page}
            pageSize={data.page_size}
            total={data.total}
            disabled={loading}
            onChange={(page, pageSize) => setFilters((value) => ({ ...value, page, pageSize }))}
          />
        )}
      </QueryRegion>
      <div className={intakeListFootStyles}>
        <ShieldCheck size={14} />
        <span>点阵由内容摘要生成，相同内容保持一致。点击记录查看详情与下一步。</span>
      </div>
      <Overlay
        open={!!active}
        onClose={() => onSelect('')}
        size="workspace"
        label="校验与发布申请"
        variant="sheet"
        loadingKey={active}
      >
        <div className={publishIntakeHeaderStyles}>
          <div>
            <p className={eyebrowStyles}>INTAKE & PUBLICATION</p>
            <h2>校验与发布申请</h2>
          </div>
          <button
            type="button"
            className={iconBtnStyles}
            aria-label="关闭接收记录"
            onClick={() => onSelect('')}
          >
            <X size={20} />
          </button>
        </div>
        <div className="relative flex min-h-0 flex-1 flex-col lg:static">
          <div
            data-intake-scroll
            className={cn(
              publishIntakeBodyStyles,
              detail?.version_id && me?.capabilities.can_ai && 'max-lg:pb-24 max-[600px]:pb-24',
            )}
          >
            {detailError ? (
              <ErrorState message={detailError} retry={reload} />
            ) : detailLoading && !detail ? (
              <Loading label="正在加载接收详情…" />
            ) : (
              detail && (
                <IntakeDetail
                  footerSlot={footerSlot}
                  key={detail.id}
                  intake={detail}
                  origin={origin}
                  suggestion={me?.capabilities.can_ai ? suggestion : undefined}
                  onSelect={onSelect}
                  connection={connection}
                />
              )
            )}
          </div>
          {detail?.version_id && (
            <BusinessAgentPanel
              className="absolute lg:top-5 lg:bottom-auto lg:right-[calc(100%_+_20px)] lg:max-w-[calc(100vw_-_100%_-_40px)]"
              key={detail.version_id}
              versionId={detail.version_id}
              onAdopt={setOrigin}
              onSuggestion={setSuggestion}
              title={detail.asset_slug}
            />
          )}
        </div>
        <div ref={setFooterSlot} className="shrink-0 empty:hidden" />
      </Overlay>
    </section>
  );
}
