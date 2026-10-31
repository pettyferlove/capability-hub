import { Overlay } from '../shared/components/Overlay.js';
import { DialogTitle } from '../shared/components/DialogTitle.js';
import { DetailSkeleton } from '../shared/components/Skeleton.js';
import { sheetScrollStyles } from '../shared/styles/recipes.js';
import { assetDetailScrollStyles } from '../features/catalog/styles.js';
import { cn } from '../shared/styles/cn.js';
import { bootErrorStyles, skipLinkStyles, mainShellStyles, appFooterStyles } from './styles.js';
import { pageContentStyles } from '../shared/styles/recipes.js';
import type { ReviewResponse } from '@capability-hub/contracts/http';
import { Toast } from '@heroui/react';
import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
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
import { CommandPalette } from './CommandPalette.js';
import { PageBoundary } from './PageBoundary.js';
const AssetSheet = lazy(() => import('../features/catalog/AssetSheet.js'));
const Publish = lazy(() => import('../features/publishing/PublishPage.js'));
const Review = lazy(() => import('../features/review/ReviewPage.js'));
const Connect = lazy(() => import('../features/connect/ConnectPage.js'));
const Account = lazy(() => import('../features/identity/AccountPage.js'));
const AiLab = lazy(() => import('../features/ai/AiLabPage.js'));
const pagePlaceholders = {
  discover: { title: '资源目录', variant: 'cards' },
  publish: { title: '分享 Skill 与 MCP', variant: 'publish' },
  review: { title: '发布审核', variant: 'review' },
  connect: { title: '安装与接入', variant: 'connect' },
  account: { title: '个人中心', variant: 'profile' },
  login: { title: '登录', variant: 'profile' },
  ai: { title: 'AI 工作台', variant: 'cards' },
} as const;
export default function App() {
  const view = useAppRoute();
  const [refresh, setRefresh] = useState(0);
  const [palette, setPalette] = useState(false);
  const { me, initialized, setupRequired, loading, error, load, logout } = useSession(refresh);
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
      : ['connect', 'account', 'publish'].includes(view.page)
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
  useEffect(() => {
    if (me && view.page === 'login') navigate(loginReturnPath(view.query), { replace: true });
  }, [me, view.page, view.query]);
  const accountTab = new URLSearchParams(view.query).get('tab') ?? 'profile';
  const placeholder = pagePlaceholders[view.page];
  if (loading)
    return (
      <LoadingScope scopeKey={pageScrollKey}>
        <Loading variant="page" label="正在连接能力共享中心…" />
      </LoadingScope>
    );
  if (error)
    return (
      <LoadingScope scopeKey={pageScrollKey}>
        <div className={bootErrorStyles}>
          <ErrorState message={error} retry={load} />
        </div>
      </LoadingScope>
    );
  if (!me && (view.page === 'login' || ['publish', 'review', 'account', 'ai'].includes(view.page)))
    return (
      <LoadingScope scopeKey={pageScrollKey}>
        <Login initialized={initialized} setupRequired={setupRequired} onLogin={load} />
      </LoadingScope>
    );
  return (
    <LoadingScope scopeKey={pageScrollKey}>
      <Toast.Provider placement="bottom end" />
      <HubCtx.Provider
        key={me?.id ?? 'anonymous'}
        value={{ me, reviewCount, refresh, reload, openPalette: () => setPalette(true), logout }}
      >
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
        <AppHeader
          page={view.page}
          returnTo={location.pathname + location.search}
          reviewCount={reviewCount}
          theme={theme}
          searchOpen={palette}
          onSearch={() => setPalette(true)}
        />
        <main id="main-content" className={mainShellStyles} tabIndex={-1}>
          <PageBoundary key={view.page + (view.page === 'connect' ? '?' + view.query : '')}>
            <Suspense
              fallback={
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
              }
            >
              <div className={pageContentStyles} key={view.page}>
                {view.page === 'discover' && <Discover />}{' '}
                {view.page === 'publish' && <Publish query={view.query} />}
                {view.page === 'review' && <Review query={view.query} />}
                {view.page === 'connect' && <Connect routeQuery={view.query} />}
                {view.page === 'account' && <Account query={view.query} />}
                {view.page === 'ai' && <AiLab query={view.query} />}
              </div>
            </Suspense>
          </PageBoundary>
        </main>
        <footer className={appFooterStyles}>
          <span>Capability Hub</span>
          <nav aria-label="页脚导航">
            <a href="/discover">资源目录</a>
            <a href="/connect">安装与接入</a>
          </nav>
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
          <div className={cn(sheetScrollStyles, assetDetailScrollStyles)}>
            <Suspense fallback={<DetailSkeleton />}>
              {view.asset && <AssetSheet key={view.asset} slug={view.asset} />}
            </Suspense>
          </div>
        </Overlay>
        <CommandPalette open={palette} onClose={() => setPalette(false)} />
      </HubCtx.Provider>
    </LoadingScope>
  );
}
