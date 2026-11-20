import {
  hubFeedbackAreas,
  hubFeedbackKinds,
  hubFeedbackStatuses,
  hubFeedbackSurfaces,
} from '@capability-hub/contracts';
import { useCallback, useEffect, useId, useState } from 'react';
import { Button, ToggleButton } from 'react-aria-components';
import { InputField } from '../../shared/components/InputField.js';
import { SelectField } from '../../shared/components/SelectField.js';
import { useHub } from '../../shared/context/HubContext.js';
import { Check, ListFilter, MessageSquare } from '../../shared/icons/lucide.js';
import { navigate } from '../../shared/navigation/history-navigation.js';
import { pageHref } from '../../shared/navigation/history-route.js';
import { cn } from '../../shared/styles/cn.js';
import { btnStyles, panelStyles, textBtnStyles } from '../../shared/styles/recipes.js';
import { feedbackChannels, HubFeedbackList } from './HubFeedbackList.js';
import { HubFeedbackThread } from './HubFeedbackThread.js';

const queueHref = pageHref('operations', { tab: 'feedback' });
const queuePath = '/api/admin/hub-feedback';
const statuses = { open: '未结束', closed: '已结束', all: '全部状态', ...hubFeedbackStatuses };
const options = [
  { name: 'kind', label: '类型', all: '全部类型', choices: hubFeedbackKinds },
  { name: 'surface', label: '位置', all: '全部位置', choices: hubFeedbackSurfaces },
  { name: 'area', label: '模块', all: '全部模块', choices: hubFeedbackAreas },
  { name: 'channel', label: '渠道', all: '全部渠道', choices: feedbackChannels },
  {
    name: 'assignee',
    label: '负责人',
    all: '全部负责人',
    choices: { me: '我负责', none: '未分配' },
  },
] as const;

type Filter = (typeof options)[number]['name'] | 'status' | 'awaiting' | 'q';
const defaultFilters = { status: 'open' };

export function HubFeedbackWorkspace({ query }: { query: string }) {
  const { refresh } = useHub();
  const titleId = useId();
  const moreFiltersId = useId();
  const [moreFilters, setMoreFilters] = useState(false);
  const [filters, setFilters] = useState<Partial<Record<Filter, string>>>(defaultFilters);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [listRefresh, setListRefresh] = useState(0);
  const selected = new URLSearchParams(query).get('feedback');
  const awaiting = filters.awaiting === '1';
  const extraCount = options.filter(({ name }) => filters[name]).length;
  const filtered = !!(extraCount || awaiting || filters.q || filters.status !== 'open');

  useEffect(() => {
    const text = search.trim();
    if (text === (filters.q ?? '')) return;
    const timer = window.setTimeout(() => {
      setFilters((current) => ({ ...current, q: text }));
      setPage(1);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [search, filters.q]);

  const changeFilter = (name: Filter, value: string) => {
    setFilters((current) => ({ ...current, [name]: value }));
    setPage(1);
  };
  const onPageChange = useCallback((next: number, size: number) => {
    setPage(next);
    setLimit(size);
  }, []);
  const refreshList = useCallback(() => setListRefresh((current) => current + 1), []);
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value);

  function clearFilters() {
    setSearch('');
    setFilters(defaultFilters);
    setPage(1);
  }

  return (
    <section className={cn(panelStyles, 'space-y-4')} aria-labelledby={titleId}>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 gap-y-1">
        <h2 id={titleId}>平台反馈</h2>
        <Button
          className={cn(textBtnStyles, !filtered && 'invisible')}
          isDisabled={!filtered}
          onPress={clearFilters}
        >
          重置筛选
        </Button>
        <p className="col-span-full text-caption text-muted-ink">
          要查看结束后收到的留言，请同时筛选「已结束」和「待回复」。
        </p>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 max-[360px]:grid-cols-2 sm:grid-cols-[minmax(0,1fr)_9rem_auto_auto]">
        <div className="col-span-3 min-w-0 max-[360px]:col-span-2 sm:col-span-1">
          <InputField
            icon="search"
            type="search"
            aria-label="搜索反馈"
            placeholder="搜索标题或描述"
            value={search}
            maxLength={200}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <SelectField
          aria-label="状态"
          className="max-[360px]:col-span-2 max-sm:[&>button]:gap-2 max-sm:[&>button]:px-2"
          value={filters.status ?? 'open'}
          onValueChange={(value) => changeFilter('status', value)}
        >
          {Object.entries(statuses).map(([value, label]) => (
            <option value={value} key={value}>
              {label}
            </option>
          ))}
        </SelectField>
        <ToggleButton
          className={cn(
            btnStyles,
            'min-h-[var(--control-height)] px-3 max-sm:gap-1.5 max-sm:px-2 data-[selected]:border-brand data-[selected]:bg-brand-soft data-[selected]:text-brand',
          )}
          isSelected={awaiting}
          onChange={(value) => changeFilter('awaiting', value ? '1' : '')}
        >
          {awaiting ? (
            <Check size={16} aria-hidden="true" />
          ) : (
            <MessageSquare size={16} aria-hidden="true" />
          )}
          待回复
        </ToggleButton>
        <Button
          className={cn(btnStyles, 'min-h-[var(--control-height)] px-3 max-sm:gap-1.5 max-sm:px-2')}
          aria-expanded={moreFilters}
          aria-controls={moreFilters ? moreFiltersId : undefined}
          onPress={() => setMoreFilters((open) => !open)}
        >
          <ListFilter size={16} aria-hidden="true" />
          更多筛选
          {extraCount > 0 && (
            <span className="rounded-full bg-brand-soft px-1.5 text-caption tabular-nums text-brand">
              {extraCount}
            </span>
          )}
        </Button>
      </div>
      {moreFilters && (
        <div
          id={moreFiltersId}
          className="grid grid-cols-2 gap-3 rounded-xl border border-line bg-page p-3 sm:grid-cols-3 xl:grid-cols-5"
        >
          {options.map(({ name, label, choices, all }) => (
            <label key={name}>
              {label}
              <SelectField
                aria-label={label}
                value={filters[name] ?? ''}
                onValueChange={(value) => changeFilter(name, value)}
              >
                <option value="">{all}</option>
                {Object.entries(choices).map(([id, text]) => (
                  <option key={id} value={id}>
                    {text}
                  </option>
                ))}
              </SelectField>
            </label>
          ))}
        </div>
      )}
      <HubFeedbackList
        handler
        path={queuePath + '?' + params.toString()}
        refresh={refresh + listRefresh}
        onRetry={refreshList}
        hrefFor={(id) => pageHref('operations', { tab: 'feedback', feedback: id })}
        onPageChange={onPageChange}
        empty={
          filtered
            ? { title: '没有符合条件的反馈', description: '可调整搜索词或重置筛选。' }
            : { title: '没有未结束的反馈', description: '切换状态可以查看已结束的记录。' }
        }
      />
      <HubFeedbackThread
        handler
        reference={selected}
        onClose={() => navigate(queueHref, { replace: true })}
        onChanged={refreshList}
      />
    </section>
  );
}
