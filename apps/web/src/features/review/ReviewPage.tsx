import {
  reviewPageStyles,
  reviewStatusbarStyles,
  reviewWorkspaceStyles,
  reviewInboxStyles,
  inboxCaptionStyles,
  inboxItemsStyles,
  inboxKindStyles,
  tagAmberStyles,
  inboxVersionStyles,
  inboxFootStyles,
  inboxGuidanceStyles,
  reviewStageStyles,
} from './styles.js';
import {
  btnStyles,
  subtleStyles,
  activeStyles,
  tagStyles,
  tagTealStyles,
} from '../../shared/styles/recipes.js';
import { cn } from '../../shared/styles/cn.js';
import type { ReviewResponse } from '@capability-hub/contracts/http';
import { ArrowRight, RefreshCw, ShieldCheck } from '../../shared/icons/lucide.js';
import { useQuery } from '../../shared/api/use-query.js';
import { Empty } from '../../shared/components/Empty.js';
import { ErrorState } from '../../shared/components/ErrorState.js';
import { PageHead } from '../../shared/components/PageHead.js';
import { ReviewSkeleton } from '../../shared/components/Skeleton.js';
import { QueryRegion } from '../../shared/components/QueryRegion.js';
import { useHub } from '../../shared/context/HubContext.js';
import { dateLabel } from '../../shared/format/labels.js';
import {
  pageHref,
  parseHistoryRoute,
  reviewLocation,
} from '../../shared/navigation/history-route.js';
import { navigate } from '../../shared/navigation/history-navigation.js';
import { ReviewDetail } from './ReviewDetail.js';
import { ReviewStatusTabs } from './ReviewStatusTabs.js';
import type { ChangeFile } from './types.js';
export default function ReviewPage() {
  const { refresh, reload } = useHub();
  const { state, request: selected } = reviewLocation(
    parseHistoryRoute(location.pathname, location.search).query,
  );
  const { data, error, loading, isPreviousData } = useQuery<{ items: ReviewResponse[] }>(
    '/api/publication-requests?state=' + state,
    refresh,
    { keepPreviousData: true },
  );
  const items = data?.items ?? [];
  const active = items.find((r) => r.id === selected) ?? items[0];
  return (
    <div className={reviewPageStyles}>
      <PageHead
        eyebrow="REVIEW WORKSPACE"
        title="发布审核"
        description="审核内容发布与通用提名，核对变更、来源授权和分发受众。"
        action={
          <button className={btnStyles} onClick={reload}>
            <RefreshCw size={14} />
            刷新队列
          </button>
        }
      />
      <div className={reviewStatusbarStyles}>
        <ReviewStatusTabs
          state={state}
          count={!loading && !isPreviousData && !error && data ? items.length : undefined}
        />
        <span className={cn(subtleStyles, 'shrink-0 max-[1100px]:hidden')}>
          决定绑定固定内容与分发策略
        </span>
      </div>
      <QueryRegion label="审核队列结果" loading={loading} isPreviousData={isPreviousData}>
        {loading && !data ? (
          <ReviewSkeleton />
        ) : error ? (
          <ErrorState message={error} retry={reload} />
        ) : !items.length ? (
          <Empty
            title={state === 'pending' ? '待审事项已处理完毕' : '暂无这类审核记录'}
            action={
              <a className={btnStyles} href="/discover">
                发现已发布能力
                <ArrowRight size={15} />
              </a>
            }
          >
            {state === 'pending'
              ? '新的发布申请与通用提名会出现在这里。你也可以切换状态，回看每一次审核决定。'
              : '内容版本、分发策略和审核意见均保留，可随时追溯。'}
          </Empty>
        ) : (
          <div className={reviewWorkspaceStyles} aria-busy={loading}>
            <aside className={reviewInboxStyles}>
              <div className={inboxCaptionStyles}>
                <span>{state === 'pending' ? '待处理申请' : '审核记录'}</span>
                <span>{items.length}</span>
              </div>
              <div className={inboxItemsStyles} aria-label="审核队列">
                {items.map((r) => (
                  <button
                    key={r.id}
                    className={active?.id === r.id ? activeStyles : ''}
                    onClick={() => {
                      navigate(
                        pageHref('review', {
                          state: state === 'pending' ? undefined : state,
                          request: r.id,
                        }),
                      );
                    }}
                    aria-pressed={active?.id === r.id}
                  >
                    <div className={inboxKindStyles}>
                      <span
                        className={cn(
                          tagStyles,
                          r.asset.kind === 'skill' ? tagTealStyles : tagAmberStyles,
                        )}
                      >
                        {r.asset.kind === 'skill' ? 'SKILL' : 'MCP'}
                      </span>
                      <small>{dateLabel(r.created_at)}</small>
                    </div>
                    <strong>{r.asset.slug}</strong>
                    {r.nomination && <span className={cn(tagStyles, tagTealStyles)}>通用提名</span>}
                    <span className={inboxVersionStyles}>
                      {r.candidate.version_label.startsWith('git.')
                        ? r.candidate.version_label.slice(0, 16) + '…'
                        : r.candidate.version_label}
                    </span>
                    <div className={inboxFootStyles}>
                      <span>{r.submitter}</span>
                      <span>
                        {r.diff.filter((f: ChangeFile) => f.status !== 'unchanged').length}{' '}
                        个文件变化
                      </span>
                    </div>
                  </button>
                ))}
              </div>
              <div className={inboxGuidanceStyles}>
                <ShieldCheck size={17} />
                <span>只展示与你的审核或维护范围相关的申请。</span>
              </div>
            </aside>
            <div className={reviewStageStyles}>
              {active && <ReviewDetail key={active.id} request={active} />}
            </div>
          </div>
        )}
      </QueryRegion>
    </div>
  );
}
