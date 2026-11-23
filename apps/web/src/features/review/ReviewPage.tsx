/**
 * 发布审核工作台：按状态拉取 `/api/publication-requests?state=`，左侧队列、右侧详情。
 * 选中项由 URL 的 `state`/`request` 决定，非法状态回落到 `pending`（见 `reviewLocation`）。
 */
import { useLayoutEffect, useRef, useState } from 'react';
import { shortVersion } from '../../shared/format/version-label.js';
import { Glyph } from '../../shared/components/Glyph.js';
import {
  reviewPageStyles,
  reviewApprovalStyles,
  reviewStatusbarStyles,
  reviewWorkspaceStyles,
  reviewInboxStyles,
  inboxCaptionStyles,
  inboxItemsStyles,
  inboxKindStyles,
  tagAmberStyles,
  inboxVersionStyles,
  inboxMetadataStyles,
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
import { ApiKeyBadge } from '../catalog/ApiKeyBadge.js';
import type { ReviewResponse } from '@capability-hub/contracts/http';
import { ArrowRight, CheckCheck, RefreshCw, ShieldCheck } from '../../shared/icons/lucide.js';
import { useQuery } from '../../shared/api/use-query.js';
import { Empty } from '../../shared/components/Empty.js';
import { ErrorState } from '../../shared/components/ErrorState.js';
import { PageHead } from '../../shared/components/PageHead.js';
import { ReviewSkeleton } from '../../shared/components/Skeleton.js';
import { QueryRegion } from '../../shared/components/QueryRegion.js';
import { useHub } from '../../shared/context/HubContext.js';
import { dateLabel } from '../../shared/format/labels.js';
import { pageHref, reviewLocation } from '../../shared/navigation/history-route.js';
import { navigate } from '../../shared/navigation/history-navigation.js';
import { ReviewDetail } from './ReviewDetail.js';
import { ReviewStatusTabs } from './ReviewStatusTabs.js';
import { isInAudience } from './audience-change.js';
import type { ChangeFile } from './types.js';

/** 队列底边与视口保持的间距，与顶栏下方留白一致。 */
const inboxBottomGap = 20;
const inboxMinHeight = 240;

/**
 * 队列与详情共用一份数据：URL 指向的申请不在当前状态列表里时回落第一条。
 * 切状态保留上一份数据（`keepPreviousData`）以免闪空，期间状态条只显示占位而不是旧计数。
 */
export default function ReviewPage({ query = location.search }: { query?: string }) {
  const { refresh, reload, me } = useHub();
  const { state, request: selected } = reviewLocation(query);
  const [approval, setApproval] = useState<{
    query: string;
    id: string;
    slug: string;
    audienceLabel: string;
    audience: readonly string[];
  }>();
  const receipt = approval?.query === query ? approval : undefined;
  const receiptRef = useRef<HTMLDivElement>(null);
  const { data, error, errorProps, loading, isPreviousData } = useQuery<{
    items: ReviewResponse[];
  }>('/api/publication-requests?state=' + state, refresh, { keepPreviousData: true });
  const rows = data?.items ?? [];
  const items = approval ? rows.filter((r) => r.id !== approval.id || r.state !== 'pending') : rows;
  const active = items.find((r) => r.id === selected) ?? items[0];
  const [inbox, setInbox] = useState<HTMLElement | null>(null);
  const [stage, setStage] = useState<HTMLDivElement | null>(null);
  const shown = useRef(active?.id);
  // 粘性队列只占详情列在视口中露出的高度：页首不被视口截断，页底也不会被推到顶栏下。
  useLayoutEffect(() => {
    if (!inbox || !stage) return;
    let frame = 0;
    const fit = () => {
      frame = 0;
      const style = getComputedStyle(inbox);
      if (style.position !== 'sticky') {
        inbox.style.removeProperty('--review-inbox-height');
        return;
      }
      const bounds = stage.getBoundingClientRect();
      const top = Math.max(parseFloat(style.top), bounds.top);
      const bottom = Math.min(window.innerHeight - inboxBottomGap, bounds.bottom);
      inbox.style.setProperty(
        '--review-inbox-height',
        `${Math.max(bottom - top, inboxMinHeight)}px`,
      );
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(fit);
    };
    fit();
    const observer = new ResizeObserver(schedule);
    observer.observe(stage);
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    };
  }, [inbox, stage]);
  // 换到另一份申请时从它的开头读起；详情开头仍可见就不移动页面。
  useLayoutEffect(() => {
    if (!stage || shown.current === active?.id) return;
    shown.current = active?.id;
    if (stage.getBoundingClientRect().top < parseFloat(getComputedStyle(stage).scrollMarginTop))
      stage.scrollIntoView({ block: 'start' });
  }, [stage, active?.id]);
  useLayoutEffect(() => {
    if (!receipt) return;
    const node = receiptRef.current;
    node?.focus({ preventScroll: true });
    node?.scrollIntoView?.({ block: 'nearest', behavior: 'instant' });
  }, [receipt]);

  function showApproval({ id, asset, distribution, visibility_label }: ReviewResponse) {
    setApproval({
      query,
      id,
      slug: asset.slug,
      audienceLabel: visibility_label,
      audience: distribution.audience,
    });
  }

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
      {receipt && (
        <div
          ref={receiptRef}
          className={reviewApprovalStyles}
          role="group"
          aria-label="发布结果"
          aria-describedby="review-approval-summary"
          tabIndex={-1}
        >
          <CheckCheck size={18} className="mt-0.5 text-success" />
          <div id="review-approval-summary" className="min-w-0 space-y-1 [overflow-wrap:anywhere]">
            <strong className="text-ink">
              审核通过，已发布 <span className="font-mono">{receipt.slug}</span>
            </strong>
            <p>分发受众：{receipt.audienceLabel}</p>
            {me && !isInAudience(receipt.audience, me) && <p>你不在本次分发受众中。</p>}
          </div>
          <a
            className={cn(btnStyles, 'justify-self-start')}
            href={pageHref('review', { state: 'approved', request: receipt.id })}
          >
            查看审核记录
            <ArrowRight size={14} />
          </a>
        </div>
      )}
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
          <ErrorState message={error} {...errorProps} retry={reload} />
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
            <aside ref={setInbox} className={reviewInboxStyles}>
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
                    <div className="flex items-center gap-3 min-w-0">
                      <Glyph
                        seed={r.candidate.content_digest}
                        kind={r.asset.kind}
                        size={36}
                        diffWith={r.current?.content_digest}
                      />
                      <strong>{r.asset.slug}</strong>
                    </div>
                    <div className={inboxMetadataStyles}>
                      <span
                        className={cn(inboxVersionStyles, 'min-w-0 [overflow-wrap:anywhere]')}
                        title={[r.current?.version_label, r.candidate.version_label]
                          .filter(Boolean)
                          .join(' → ')}
                      >
                        {/* 版本号内部不断行，窄栏只在箭头处换行。 */}
                        {r.current?.version_label
                          ? `${shortVersion(r.current.version_label).replaceAll(' ', '\u00a0')} → `
                          : '首次发布 · '}
                        {shortVersion(r.candidate.version_label).replaceAll(' ', '\u00a0')}
                      </span>
                      {r.asset.kind === 'skill' && r.requires_api_key && <ApiKeyBadge />}
                      {r.nomination && (
                        <span className={cn(tagStyles, tagTealStyles)}>通用提名</span>
                      )}
                    </div>
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
            <div ref={setStage} className={reviewStageStyles}>
              {active && (
                <ReviewDetail
                  key={active.id}
                  request={active}
                  autoStartBrief={!isPreviousData}
                  onApproved={showApproval}
                />
              )}
            </div>
          </div>
        )}
      </QueryRegion>
    </div>
  );
}
