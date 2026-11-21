/**
 * 资产详情的主体内容：概览、文件清单、使用与安装、版本历史、问题与建议五个互斥视图。
 * 依赖 `GET /api/assets/{slug}/versions` 与 {@link useSnapshotFile} 读取视图展示的发布文件；
 * 历史位置由 {@link detailNavigation} 维护，滚动位置与焦点在切换时按 key 恢复。
 */
import { VersionLabel } from '../../shared/components/VersionLabel.js';
import { shortVersion } from '../../shared/format/version-label.js';
import { AssetFeedback } from './AssetFeedback.js';
import {
  assetContentStyles,
  detailActionsStyles,
  detailContentNavigationStyles,
  detailReadingNavigationStyles,
  detailCurrentFileStyles,
  assetContentPanelStyles,
  historyListStyles,
} from './styles.js';
import {
  btnStyles,
  btnPrimaryStyles,
  subtleStyles,
  iconBtnStyles,
  textBtnStyles,
  monoStyles,
  tagStyles,
  tagTealStyles,
} from '../../shared/styles/recipes.js';
import { cn } from '../../shared/styles/cn.js';
import type { VersionHistoryResponse } from '@capability-hub/contracts/http';
import type { AssetDrawerTab } from '../../shared/navigation/history-route.js';
import type { AssetView } from './asset-view.js';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Download,
  FileText,
  History,
  MessageSquare,
  Terminal,
} from '../../shared/icons/lucide.js';
import { useId, useLayoutEffect, useReducer, useRef, useState } from 'react';
import { useQuery } from '../../shared/api/use-query.js';
import { CodeBlock } from '../../shared/components/CodeBlock.js';
import { Empty } from '../../shared/components/Empty.js';
import { ErrorState } from '../../shared/components/ErrorState.js';
import { Message } from '../../shared/components/Message.js';
import { PageTabs } from '../../shared/components/PageTabs.js';
import { markdownBody } from '../../shared/components/SafeMarkdown.js';
import { CodeSkeleton, ListSkeleton } from '../../shared/components/Skeleton.js';
import { useHub } from '../../shared/context/HubContext.js';
import { bytesLabel, dateLabel, stateLabel } from '../../shared/format/labels.js';
import { AssetCommunity } from './AssetCommunity.js';
import { ResourceInstallation } from './ResourceInstallation.js';
import { SnapshotFileBrowser } from './SnapshotFileBrowser.js';
import { SnapshotMarkdown } from './SnapshotMarkdown.js';
import {
  detailLocationKey,
  detailNavigation,
  type DetailLocation,
  type DetailTab,
} from './detail-navigation.js';
import { useSnapshotFile } from './use-snapshot-file.js';

const detailScrollSelector = '[data-asset-detail-scroll]';

function scrollDetail(start: HTMLDivElement | null, position?: number) {
  const scroller = start?.closest<HTMLElement>(detailScrollSelector);
  if (!start || !scroller) return;
  scroller.scrollTop =
    position ??
    scroller.scrollTop + start.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
}

/**
 * 详情内容区：标签切换与文件跳转共用一条历史栈，后退/前进在同一面板内完成。
 * 文件、下载、反馈与安装都锁定 `view.release`；初始页签只取抽屉参数 `tab`。
 */
export function AssetContent({ view: assetView, tab }: { view: AssetView; tab?: AssetDrawerTab }) {
  const { refresh, reload } = useHub();
  const { asset, release } = assetView;
  const entry = asset.kind === 'skill' ? 'SKILL.md' : 'server.json';
  const versionId = release.version_id;
  const hasReadme = asset.kind === 'skill' && asset.files.some((file) => file.path === 'README.md');
  const readme = useSnapshotFile(versionId, hasReadme ? 'README.md' : null, refresh);
  const readmeBody = readme.text === undefined ? undefined : markdownBody(readme.text);
  const readmeFallback =
    hasReadme &&
    (readme.unavailable || (!readme.error && readmeBody !== undefined && !readmeBody.trim()));
  const showReadme = hasReadme && !readmeFallback;
  const entryFile = useSnapshotFile(versionId, showReadme ? null : entry, refresh);
  const overview = showReadme ? readme : entryFile;
  const overviewPath = showReadme ? 'README.md' : entry;
  const history = useQuery<VersionHistoryResponse[]>(
    `/api/assets/${encodeURIComponent(asset.slug)}/versions${assetView.current ? '' : '?latest_readable=1'}`,
    refresh,
  );
  const [navigation, dispatch] = useReducer(detailNavigation, {
    entries: [{ tab: tab ?? 'overview', path: entry }],
    index: 0,
  });
  const view = navigation.entries[navigation.index];
  const currentFile = view.tab === 'overview' ? overviewPath : view.path;
  const [lastFile, setLastFile] = useState(entry);
  const [mode, setMode] = useState<'read' | 'source'>('read');
  const contentStart = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const positions = useRef(new Map<string, number>());
  const pendingScroll = useRef<'restore' | 'start' | null>(null);
  const pendingFocus = useRef(false);
  const id = useId();
  const tabs: { id: DetailTab; label: string }[] = [
    { id: 'overview', label: '内容说明' },
    { id: 'files', label: `文件清单 ${asset.files.length}` },
    { id: 'installation', label: '使用与安装' },
    { id: 'versions', label: '版本历史' },
    { id: 'feedback', label: '问题与建议' },
  ];
  function remember(focus = false, scroll: 'restore' | 'start' = 'restore') {
    const scroller = contentStart.current?.closest<HTMLElement>(detailScrollSelector);
    if (scroller) positions.current.set(detailLocationKey(view), scroller.scrollTop);
    pendingScroll.current = scroll;
    pendingFocus.current = focus;
  }
  function open(location: DetailLocation, focus = false, scroll: 'restore' | 'start' = 'restore') {
    if (detailLocationKey(location) === detailLocationKey(view)) {
      if (focus) {
        scrollDetail(contentStart.current);
        panel.current?.focus({ preventScroll: true });
      }
      return;
    }
    remember(focus, scroll);
    dispatch({ type: 'open', location });
  }
  function switchTab(tab: DetailTab) {
    open(
      { tab, path: tab === 'files' ? lastFile : entry },
      false,
      tab === 'files' ? 'start' : 'restore',
    );
  }
  function openFile(path: string, anchor?: string) {
    if (!asset.files.some((file) => file.path === path)) return;
    setLastFile(path);
    setMode('read');
    open({ tab: 'files', path, anchor }, true, 'start');
  }
  useLayoutEffect(() => {
    const scroll = pendingScroll.current;
    if (!scroll) return;
    pendingScroll.current = null;
    const position =
      scroll === 'restore' ? positions.current.get(detailLocationKey(view)) : undefined;
    scrollDetail(contentStart.current, position);
    if (pendingFocus.current) panel.current?.focus({ preventScroll: true });
    pendingFocus.current = false;
  }, [view]);
  const fileDownload = `/api/versions/${versionId}/files?path=`;
  return (
    <div className={assetContentStyles}>
      <div className={detailActionsStyles}>
        <button
          type="button"
          className={cn(btnStyles, btnPrimaryStyles)}
          onClick={() => open({ tab: 'installation', path: entry }, true, 'start')}
        >
          <Terminal size={16} />
          使用与安装
        </button>
        <a className={btnStyles} href={`/api/versions/${versionId}/archive`}>
          <Download size={16} />
          下载固定版本
        </a>
        <button
          type="button"
          className={btnStyles}
          onClick={() => open({ tab: 'feedback', path: entry }, true, 'start')}
        >
          <MessageSquare size={16} />
          问题与建议
        </button>
        <span className={subtleStyles}>
          {asset.files.length} 个文件 ·{' '}
          {bytesLabel(asset.files.reduce((size, file) => size + file.size, 0))}
        </span>
      </div>
      {assetView.current && (
        <AssetCommunity
          key={assetView.current.current_release.release_id}
          asset={assetView.current}
        />
      )}
      <div ref={contentStart} aria-hidden="true" />
      <div className={detailContentNavigationStyles}>
        <PageTabs
          label="资产详情内容"
          value={view.tab}
          onValueChange={switchTab}
          items={tabs}
          panelId={id}
        />
        <div className={detailReadingNavigationStyles} aria-label="详情阅读历史">
          <button
            type="button"
            className={iconBtnStyles}
            aria-label="返回上一步"
            disabled={navigation.index === 0}
            onClick={() => {
              remember(true);
              dispatch({ type: 'back' });
            }}
          >
            <ArrowLeft size={16} />
          </button>
          <button
            type="button"
            className={iconBtnStyles}
            aria-label="前进一步"
            disabled={navigation.index === navigation.entries.length - 1}
            onClick={() => {
              remember(true);
              dispatch({ type: 'forward' });
            }}
          >
            <ArrowRight size={16} />
          </button>
          <span className={detailCurrentFileStyles} title={currentFile}>
            {view.tab === 'overview' || view.tab === 'files'
              ? currentFile
              : view.tab === 'installation'
                ? '使用与安装'
                : view.tab === 'feedback'
                  ? '问题与建议'
                  : '版本历史'}
          </span>
          {view.tab === 'overview' && showReadme && (
            <button type="button" className={textBtnStyles} onClick={() => openFile(entry)}>
              <FileText size={14} />
              查看 SKILL.md
            </button>
          )}
          {view.tab === 'files' && (
            <button
              type="button"
              className={textBtnStyles}
              onClick={() => open({ tab: 'overview', path: entry }, true)}
            >
              <BookOpen size={14} />
              返回内容说明
            </button>
          )}
        </div>
      </div>
      <div
        ref={panel}
        role="tabpanel"
        id={`${id}-${view.tab}`}
        aria-labelledby={`${id}-tab-${view.tab}`}
        tabIndex={0}
        className={assetContentPanelStyles}
      >
        <div hidden={view.tab !== 'overview'} aria-busy={overview.loading || overview.refreshing}>
          {readmeFallback && (
            <Message className="mb-4">
              {readme.unavailable ? `README.md：${readme.error}` : 'README.md 没有正文。'}{' '}
              <a href={fileDownload + 'README.md'}>下载 README.md</a>
            </Message>
          )}
          {overview.loading ? (
            view.tab === 'overview' && <CodeSkeleton />
          ) : overview.error ? (
            <>
              <ErrorState
                message={overview.error}
                {...overview.errorProps}
                retry={overview.unavailable ? undefined : overview.retry}
              />
              <a className={textBtnStyles} href={fileDownload + encodeURIComponent(overviewPath)}>
                下载说明文件
              </a>
            </>
          ) : asset.kind === 'skill' ? (
            <SnapshotMarkdown
              text={showReadme ? (readmeBody ?? '') : markdownBody(overview.text ?? '')}
              currentFile={overviewPath}
              paths={asset.files.map((file) => file.path)}
              onOpen={openFile}
            />
          ) : (
            <CodeBlock title="server.json" code={overview.text ?? ''} />
          )}
        </div>
        <div hidden={view.tab !== 'files'}>
          <SnapshotFileBrowser
            view={assetView}
            active={view.tab === 'files'}
            path={view.tab === 'files' ? view.path : lastFile}
            anchor={view.tab === 'files' ? view.anchor : undefined}
            mode={mode}
            onModeChange={setMode}
            onOpen={openFile}
          />
        </div>
        <div hidden={view.tab !== 'installation'}>
          {release.has_scripts && (
            <Message>此版本含可执行脚本，建议安装前在「文件清单」中审阅。</Message>
          )}
          <ResourceInstallation view={assetView} origin={location.origin} />
        </div>
        <div hidden={view.tab !== 'feedback'}>
          {navigation.entries.some((location) => location.tab === 'feedback') && (
            <AssetFeedback assetId={asset.asset_id} versionId={versionId} />
          )}
        </div>
        <div hidden={view.tab !== 'versions'}>
          {history.error ? (
            <ErrorState message={history.error} {...history.errorProps} retry={reload} />
          ) : !history.data ? (
            view.tab === 'versions' && <ListSkeleton label="正在加载版本历史…" rows={3} />
          ) : !history.data.length ? (
            <Empty title="暂无版本记录">发布的版本会显示在这里。</Empty>
          ) : (
            <div className={historyListStyles}>
              {history.data.map((version) => (
                <div key={version.version_id}>
                  <History size={17} />
                  <div>
                    <strong className={monoStyles}>
                      <VersionLabel value={version.version_label} />
                    </strong>
                    <small>
                      {dateLabel(version.created_at)}
                      {version.availability ? ` · ${stateLabel(version.availability)}` : ''}
                    </small>
                  </div>
                  {version.version_id === assetView.latestVersionId ? (
                    <span className={cn(tagStyles, tagTealStyles)}>
                      {assetView.current ? '当前版本' : '最新可读版本'}
                    </span>
                  ) : (
                    version.version_id === versionId && <span className={tagStyles}>正在查看</span>
                  )}
                  <a
                    aria-label={'下载版本 ' + shortVersion(version.version_label, true)}
                    className={iconBtnStyles}
                    href={`/api/versions/${version.version_id}/archive`}
                  >
                    <Download size={17} />
                  </a>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
