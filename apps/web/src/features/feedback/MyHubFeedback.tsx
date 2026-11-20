import { useCallback, useEffect, useId, useState } from 'react';
import { PageTabs } from '../../shared/components/PageTabs.js';
import { useHub } from '../../shared/context/HubContext.js';
import { openHubFeedback } from '../../shared/hub-feedback-events.js';
import { navigate } from '../../shared/navigation/history-navigation.js';
import { btnPrimaryStyles, btnStyles, panelStyles } from '../../shared/styles/recipes.js';
import { cn } from '../../shared/styles/cn.js';
import { myHubFeedbackHref } from './hub-feedback-api.js';
import { HubFeedbackList } from './HubFeedbackList.js';
import { HubFeedbackThread } from './HubFeedbackThread.js';

const views = [
  { id: 'open', label: '未结束' },
  { id: 'closed', label: '已结束' },
  { id: 'all', label: '全部' },
] as const;

type View = (typeof views)[number]['id'];
const empty = {
  open: { title: '没有未结束的反馈', description: '提交后的反馈及处理进展会显示在这里。' },
  closed: { title: '没有已结束的反馈', description: '已解决或不采纳的反馈会显示在这里。' },
  all: { title: '还没有反馈', description: '遇到 Hub 的问题，可以从「新反馈」告诉我们。' },
} as const;

export default function MyHubFeedback({ query }: { query: string }) {
  const { refresh } = useHub();
  const tabId = useId();
  const [view, setView] = useState<View>('open');
  const [{ page, limit }, setPagination] = useState({ page: 1, limit: 20 });
  const [listRefresh, setListRefresh] = useState(0);
  const selected = new URLSearchParams(query).get('feedback');
  const params = new URLSearchParams({ status: view, page: String(page), limit: String(limit) });
  const refreshList = useCallback(() => setListRefresh((current) => current + 1), []);
  const onPageChange = useCallback(
    (next: number, size: number) => setPagination({ page: next, limit: size }),
    [],
  );
  useEffect(() => {
    function submitted(event: WindowEventMap['hub:feedback-changed']) {
      if (event.detail.kind === 'submitted') refreshList();
    }
    window.addEventListener('hub:feedback-changed', submitted);
    return () => window.removeEventListener('hub:feedback-changed', submitted);
  }, [refreshList]);

  return (
    <section className={cn(panelStyles, 'space-y-4')} aria-labelledby={tabId + '-title'}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id={tabId + '-title'}>我的反馈</h2>
        <button
          type="button"
          className={cn(btnStyles, btnPrimaryStyles)}
          onClick={() => openHubFeedback()}
        >
          新反馈
        </button>
      </div>
      <PageTabs
        label="反馈状态"
        panelId={tabId}
        items={[...views]}
        value={view}
        onValueChange={(next) => {
          setView(next);
          setPagination({ page: 1, limit });
        }}
      />
      <div role="tabpanel" id={`${tabId}-${view}`} aria-labelledby={`${tabId}-tab-${view}`}>
        <HubFeedbackList
          path={'/api/hub-feedback?' + params.toString()}
          refresh={refresh + listRefresh}
          onRetry={refreshList}
          hrefFor={myHubFeedbackHref}
          onPageChange={onPageChange}
          empty={empty[view]}
        />
      </div>
      <HubFeedbackThread
        reference={selected}
        onClose={() => navigate(myHubFeedbackHref(), { replace: true })}
        onChanged={refreshList}
      />
    </section>
  );
}
