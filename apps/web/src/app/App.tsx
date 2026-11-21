import { Overlay } from '../shared/components/Overlay.js';
import { Glyph } from '../shared/components/Glyph.js';
import { DialogTitle } from '../shared/components/DialogTitle.js';
import { DetailSkeleton } from '../shared/components/Skeleton.js';
import { sheetScrollStyles } from '../shared/styles/recipes.js';
import { assetDetailScrollStyles } from '../features/catalog/styles.js';
import { cn } from '../shared/styles/cn.js';
import {
  appFooterBrandStyles,
  appFooterInnerStyles,
  appFooterMarkStyles,
  appFooterStyles,
  appFooterSubStyles,
  bootErrorStyles,
  skipLinkStyles,
  mainShellStyles,
} from './styles.js';
import { pageContentStyles } from '../shared/styles/recipes.js';
import type {
  HubFeedbackQueueSummaryResponse,
  HubFeedbackSummaryResponse,
  ReviewResponse,
} from '@capability-hub/contracts/http';
import { Suspense, useCallback, useEffect, useState } from 'react';
import Login from '../features/auth/LoginPage.js';
import Discover from '../features/catalog/DiscoverPage.js';
import { useQuery } from '../shared/api/use-query.js';
import { PageSkeleton } from '../shared/components/Skeleton.js';
import { ErrorState } from '../shared/components/ErrorState.js';
import { Loading } from '../shared/components/Loading.js';
import { LoadingScope } from '../shared/components/LoadingScope.js';
import { HubCtx } from '../shared/context/HubContext.js';
import { loginReturnPath, reviewLocation } from '../shared/navigation/history-route.js';
import { navigate, closeAsset } from '../shared/navigation/history-navigation.js';
import { useAppRoute } from './use-app-route.js';
import { useSession } from './use-session.js';
import { useTheme } from './theme.js';
import { AppHeader } from './AppHeader.js';
import OperationsCenter from '../features/operations/OperationsCenter.js';
import { CommandPalette } from './CommandPalette.js';
import { PageBoundary } from './PageBoundary.js';
import { NotFoundPage } from './NotFoundPage.js';
import { WebUpdateNotice } from './WebUpdateNotice.js';
import { lazyView } from '../shared/navigation/lazy-view.js';
import type { HubFeedbackSeed } from '../shared/hub-feedback-events.js';
import { HubFeedbackHints } from '../features/feedback/HubFeedbackHints.js';

const AssetSheet = lazyView(() => import('../features/catalog/AssetSheet.js'));
const Publish = lazyView(() => import('../features/publishing/PublishPage.js'));
const Review = lazyView(() => import('../features/review/ReviewPage.js'));
const Connect = lazyView(() => import('../features/connect/ConnectPage.js'));
const Account = lazyView(() => import('../features/identity/AccountPage.js'));
const HubFeedbackAssistant = lazyView(() => import('../features/feedback/HubFeedbackAssistant.js'));
const pagePlaceholders = {
  discover: { title: '资源目录', variant: 'cards' },
  publish: { title: '分享 Skill 与 MCP', variant: 'publish' },
  review: { title: '发布审核', variant: 'review' },
  connect: { title: '安装与接入', variant: 'connect' },
  account: { title: '个人中心', variant: 'profile' },
  login: { title: '登录', variant: 'profile' },
} as const;

/**
 * 应用外壳：先决定整个界面处在「加载中 / 启动失败 / 需登录 / 已就绪」哪一支，只有就绪后才挂载各页面，
 * 因此页面组件可以假定 `me` 存在，不必各自重复鉴权。
 * 会话未确定时统一渲染 {@link LoadingScope} 而不是分页渲染，避免子页面先发出会 401 的请求。
 * `HubCtx` 以用户 id 作为 key：切换账号会重建整棵子树，上一个账号的页面状态不会带过来。
 */
export default function App() {
  const view = useAppRoute();
  const [refresh, setRefresh] = useState(0);
  const [palette, setPalette] = useState(false);
  const [feedback, setFeedback] = useState<{
    userId: string | undefined;
    open: boolean;
    seed?: HubFeedbackSeed;
  }>();
  const [feedbackRefresh, setFeedbackRefresh] = useState(0);
  const [readFeedback, setReadFeedback] = useState<{
    summary: HubFeedbackSummaryResponse;
    ids: ReadonlySet<string>;
  }>();
  const { me, initialized, setupRequired, ldapEnabled, loading, error, load, logout } =
    useSession(refresh);
  const theme = useTheme();
  const reload = useCallback(() => setRefresh((value) => value + 1), []);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (
        !event.isComposing &&
        (event.metaKey || event.ctrlKey) &&
        event.key.toLowerCase() === 'k'
      ) {
        event.preventDefault();
        setPalette((value) => !value);
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);
  useEffect(() => {
    setPalette(false);
  }, [me?.id]);
  const pageScrollKey =
    view.page +
    (view.page === 'review'
      ? '?' + reviewLocation(view.query).state
      : ['connect', 'account', 'publish', 'operations'].includes(view.page)
        ? '?' + view.query
        : '');
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [pageScrollKey]);
  const reviews = useQuery<{ items: ReviewResponse[] }>(
    me ? '/api/publication-requests' : null,
    refresh,
  );
  const reviewCount = reviews.data?.items?.length ?? 0;
  const feedbackSummary = useQuery<HubFeedbackSummaryResponse>(
    me ? '/api/hub-feedback/summary' : null,
    refresh + feedbackRefresh,
  ).data;
  const queueSummary = useQuery<HubFeedbackQueueSummaryResponse>(
    me?.capabilities.can_manage_feedback ? '/api/admin/hub-feedback/summary' : null,
    refresh + feedbackRefresh,
  ).data;
  const userId = me?.id;
  const panel = feedback?.userId === userId ? feedback : undefined;
  const feedbackUnread = Math.max(
    0,
    (feedbackSummary?.unread ?? 0) -
      (readFeedback?.summary === feedbackSummary ? (readFeedback?.ids.size ?? 0) : 0),
  );
  const feedbackPending = queueSummary?.pending ?? 0;
  useEffect(() => {
    const open = (event: WindowEventMap['hub:feedback']) =>
      setFeedback({ userId, open: true, seed: event.detail });
    const change = (event: WindowEventMap['hub:feedback-changed']) => {
      const detail = event.detail;
      if (detail.kind !== 'read') setFeedbackRefresh((value) => value + 1);
      else if (feedbackSummary)
        setReadFeedback((previous) => ({
          summary: feedbackSummary,
          ids: new Set(
            previous?.summary === feedbackSummary ? [...previous.ids, detail.id] : [detail.id],
          ),
        }));
    };
    window.addEventListener('hub:feedback', open);
    window.addEventListener('hub:feedback-changed', change);
    return () => {
      window.removeEventListener('hub:feedback', open);
      window.removeEventListener('hub:feedback-changed', change);
    };
  }, [feedbackSummary, userId]);
  useEffect(() => {
    setFeedback((current) => (current?.userId === userId ? current : undefined));
    setReadFeedback(undefined);
  }, [userId]);
  useEffect(() => {
    if (me && view.page === 'login') navigate(loginReturnPath(view.query), { replace: true });
  }, [me, view.page, view.query]);
  const accountTab = new URLSearchParams(view.query).get('tab') ?? 'profile';
  const placeholder =
    view.page === 'operations' || view.page === 'not-found'
      ? undefined
      : pagePlaceholders[view.page];
  let content;
  if (loading) {
    content = <Loading variant="page" label="正在连接能力共享中心…" />;
  } else if (error) {
    content = (
      <div className={bootErrorStyles}>
        <ErrorState message={error} retry={load} />
      </div>
    );
  } else if (
    !me &&
    (view.page === 'login' || ['publish', 'review', 'account', 'operations'].includes(view.page))
  ) {
    content = (
      <>
        <WebUpdateNotice />
        <Login
          initialized={initialized}
          setupRequired={setupRequired}
          ldapEnabled={ldapEnabled}
          onLogin={load}
        />
      </>
    );
  } else {
    content = (
      <>
        <a
          className={skipLinkStyles}
          href="#main-content"
          onClick={(event) => {
            event.preventDefault();
            document.getElementById('main-content')?.focus();
          }}
        >
          跳到主要内容
        </a>
        <WebUpdateNotice />
        <AppHeader
          page={view.page}
          returnTo={location.pathname + location.search}
          reviewCount={reviewCount}
          feedbackUnread={feedbackUnread}
          feedbackPending={feedbackPending}
          theme={theme}
          searchOpen={palette}
          onSearch={() => setPalette(true)}
        />
        <main id="main-content" className={mainShellStyles} tabIndex={-1}>
          <PageBoundary key={view.page + (view.page === 'connect' ? '?' + view.query : '')}>
            <Suspense
              fallback={
                placeholder && (
                  <PageSkeleton
                    title={placeholder.title}
                    variant={
                      view.page === 'account' && accountTab !== 'profile'
                        ? accountTab === 'roles'
                          ? 'roles'
                          : 'table'
                        : placeholder.variant
                    }
                  />
                )
              }
            >
              <div className={pageContentStyles} key={view.page}>
                {view.page === 'discover' && <Discover />}{' '}
                {view.page === 'publish' && <Publish query={view.query} />}
                {view.page === 'review' && <Review query={view.query} />}
                {view.page === 'connect' && <Connect routeQuery={view.query} />}
                {view.page === 'account' && <Account query={view.query} />}
                {view.page === 'operations' && (
                  <OperationsCenter query={view.query} feedbackPending={feedbackPending} />
                )}
                {view.page === 'not-found' && <NotFoundPage />}
              </div>
            </Suspense>
          </PageBoundary>
        </main>
        <footer className={appFooterStyles}>
          <div className={appFooterInnerStyles}>
            <span className={appFooterBrandStyles}>
              <span className={appFooterMarkStyles} aria-hidden="true">
                <Glyph seed="capability-hub-footer" kind="skill" size={13} />
              </span>
              Capability Hub
              <span className={appFooterSubStyles}>能力共享中心 · 内部能力层</span>
            </span>
            <nav aria-label="页脚导航">
              <a href="/discover">资源目录</a>
              <a href="/connect">安装与接入</a>
            </nav>
          </div>
        </footer>
        <Overlay
          open={!!view.asset}
          onClose={closeAsset}
          label="资源详情"
          variant="sheet"
          size="wide"
          loadingKey={view.asset}
        >
          <DialogTitle title="资源详情" onClose={closeAsset} />
          <div data-asset-detail-scroll className={cn(sheetScrollStyles, assetDetailScrollStyles)}>
            <Suspense fallback={<DetailSkeleton />}>
              {view.drawer && (
                <AssetSheet
                  key={[
                    view.drawer.slug,
                    view.drawer.versionId,
                    view.drawer.tab,
                    view.drawer.feedbackId,
                    view.drawer.invalid,
                  ].join('\n')}
                  slug={view.drawer.slug}
                  versionId={view.drawer.versionId}
                  tab={view.drawer.tab}
                  invalid={view.drawer.invalid}
                />
              )}
            </Suspense>
          </div>
        </Overlay>
        <CommandPalette open={palette} onClose={() => setPalette(false)} />
      </>
    );
  }
  return (
    <LoadingScope scopeKey={pageScrollKey}>
      <HubFeedbackHints
        key={userId ?? 'anonymous'}
        hidden={!!(panel?.open || palette || view.asset)}
      />
      <HubCtx.Provider
        key={userId ?? 'anonymous'}
        value={{ me, reviewCount, refresh, reload, openPalette: () => setPalette(true), logout }}
      >
        {content}
        {panel && (
          <Suspense fallback={null}>
            <HubFeedbackAssistant
              open={panel.open}
              route={view}
              seed={panel.seed}
              unread={feedbackUnread}
              onClose={() =>
                setFeedback((current) => (current ? { ...current, open: false } : undefined))
              }
            />
          </Suspense>
        )}
      </HubCtx.Provider>
    </LoadingScope>
  );
}
