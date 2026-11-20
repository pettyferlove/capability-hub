import {
  hubFeedbackAreas,
  hubFeedbackKinds,
  hubFeedbackStatuses,
  hubFeedbackSurfaces,
} from '@capability-hub/contracts';
import { useCallback, useEffect, useId, useState } from 'react';
import { SelectField } from '../../shared/components/SelectField.js';
import { useHub } from '../../shared/context/HubContext.js';
import { navigate } from '../../shared/navigation/history-navigation.js';
import { pageHref } from '../../shared/navigation/history-route.js';
import { cn } from '../../shared/styles/cn.js';
import { formStackStyles, panelStyles, subtleStyles } from '../../shared/styles/recipes.js';
import { feedbackChannels, HubFeedbackList } from './HubFeedbackList.js';
import { HubFeedbackThread } from './HubFeedbackThread.js';

const queueHref = pageHref('operations', { tab: 'feedback' });
const queuePath = '/api/admin/hub-feedback';
const options = [
  {
    name: 'status',
    label: '状态',
    choices: { open: '未结束', closed: '已结束', all: '全部状态', ...hubFeedbackStatuses },
  },
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

type Filter = (typeof options)[number]['name'] | 'awaiting' | 'q';

export function HubFeedbackWorkspace({ query }: { query: string }) {
  const { refresh } = useHub();
  const titleId = useId();
  const [filters, setFilters] = useState<Partial<Record<Filter, string>>>({ status: 'open' });
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [listRefresh, setListRefresh] = useState(0);
  const selected = new URLSearchParams(query).get('feedback');

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

  return (
    <section className={cn(panelStyles, 'space-y-4')} aria-labelledby={titleId}>
      <div>
        <h2 id={titleId}>平台反馈</h2>
        <p className={subtleStyles}>
          要查看已结束反馈收到的新留言，请选择「已结束」并勾选「待回复」。
        </p>
      </div>
      <div className={cn(formStackStyles, 'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6')}>
        {options.map(({ name, label, choices, ...option }) => (
          <label key={name} className="flex min-w-0 flex-col gap-1 text-label">
            {label}
            <SelectField
              aria-label={label}
              value={filters[name] ?? ''}
              onValueChange={(value) => changeFilter(name, value)}
            >
              {'all' in option && <option value="">{option.all}</option>}
              {Object.entries(choices).map(([id, text]) => (
                <option key={id} value={id}>
                  {text}
                </option>
              ))}
            </SelectField>
          </label>
        ))}
        <label className="col-span-2 flex min-w-0 flex-col gap-1 text-label">
          搜索反馈
          <input
            type="search"
            placeholder="按标题或描述搜索"
            value={search}
            maxLength={200}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <label className="flex items-center gap-2 self-end py-3 text-label">
          <input
            type="checkbox"
            className="size-4 accent-brand"
            checked={filters.awaiting === '1'}
            onChange={(event) => changeFilter('awaiting', event.target.checked ? '1' : '')}
          />
          待回复
        </label>
      </div>
      <HubFeedbackList
        handler
        path={queuePath + '?' + params.toString()}
        refresh={refresh + listRefresh}
        onRetry={refreshList}
        hrefFor={(id) => pageHref('operations', { tab: 'feedback', feedback: id })}
        onPageChange={onPageChange}
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
