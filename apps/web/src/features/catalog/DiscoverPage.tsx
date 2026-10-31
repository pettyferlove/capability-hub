import {
  discoverStyles,
  discoverHeroStyles,
  heroDotsStyles,
  heroOrbStyles,
  heroCopyStyles,
  liveDotStyles,
  heroDescriptionStyles,
  catalogSearchStyles,
  catalogSearchIconStyles,
  catalogSearchActionStyles,
  catalogSearchClearStyles,
  quickSearchStyles,
  quickSearchItemStyles,
  keywordRefreshingStyles,
  heroArtStyles,
  orbitLineStyles,
  orbitTrackStyles,
  orbitSignalStyles,
  orbitTileStyles,
  tileMainStyles,
  tileMcpStyles,
  artCrossStyles,
  cross1Styles,
  cross2Styles,
  catalogToolbarStyles,
  catalogFiltersStyles,
  scenarioFilterStyles,
  catalogResultsStyles,
  assetGridStyles,
  catalogResultStateStyles,
  assetGridItemStyles,
  assetCardStyles,
  assetCardTopStyles,
  assetSymbolStyles,
  typeLabelStyles,
  cardArrowStyles,
  assetVersionStyles,
  assetCardMetaStyles,
  assetCardTagsStyles,
  matchReasonStyles,
  assetCardFootStyles,
  cardRecommendationsStyles,
  assetOwnerStyles,
  ownerAvatarStyles,
  assetOwnerNameStyles,
  audienceLabelStyles,
  paginationStyles,
  catalogNoteStyles,
  assetDetailScrollStyles,
} from './styles.js';
import {
  dotgridStyles,
  eyebrowStyles,
  countPillStyles,
  inlineIconStyles,
  filterTabsStyles,
  selectedStyles,
  monoStyles,
  chipsStyles,
  tagStyles,
  tagTealStyles,
  btnStyles,
  textBtnStyles,
  sheetScrollStyles,
} from '../../shared/styles/recipes.js';
import { cn } from '../../shared/styles/cn.js';
import {
  type AssetResponse,
  type KeywordSuggestionsResponse,
} from '@capability-hub/contracts/http';
import type { ScenarioResponse } from '@capability-hub/contracts/http';
import {
  ArrowRight,
  ArrowUpRight,
  FileCode2,
  Plug,
  Search,
  RefreshCw,
  ShieldCheck,
  SlidersHorizontal,
  ThumbsUp,
  X,
} from '../../shared/icons/lucide.js';
import { AnimatePresence } from 'motion/react';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useQuery } from '../../shared/api/use-query.js';
import { DialogTitle } from '../../shared/components/DialogTitle.js';
import { ErrorState } from '../../shared/components/ErrorState.js';
import { Glyph } from '../../shared/components/Glyph.js';
import { Segmented } from '../../shared/components/Segmented.js';
import { SelectField } from '../../shared/components/SelectField.js';
import { Overlay } from '../../shared/components/Overlay.js';
import { CardGridSkeleton, DetailSkeleton } from '../../shared/components/Skeleton.js';
import { QueryRegion } from '../../shared/components/QueryRegion.js';
import { ScriptBadge } from '../../shared/components/ScriptBadge.js';
import { useHub } from '../../shared/context/HubContext.js';
import { categoryLabel } from '../../shared/format/labels.js';
import { assetHref } from '../../shared/navigation/history-route.js';
import { navigate } from '../../shared/navigation/history-navigation.js';
import { CatalogMotionItem } from './CatalogMotionItem.js';
import { CatalogEmptyState } from './CatalogEmptyState.js';
const AssetSheet = lazy(() => import('./AssetSheet.js'));
export default function DiscoverPage({ openAsset }: { openAsset?: string }) {
  const searchInput = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState(''),
    [q, setQ] = useState(''),
    [kind, setKind] = useState('all'),
    [cat, setCat] = useState('all'),
    [scenario, setScenario] = useState(''),
    [cursor, setCursor] = useState(''),
    [suggestionRound, setSuggestionRound] = useState(0);
  const { refresh, reload } = useHub();
  useEffect(() => {
    const timer = setTimeout(() => {
      setQ(query);
      setCursor('');
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        e.key === '/' &&
        !['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement).tagName) &&
        !document.querySelector('[role=dialog]')
      ) {
        e.preventDefault();
        searchInput.current?.focus();
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);
  const params = new URLSearchParams({
    q,
    limit: '18',
    ...(kind !== 'all' ? { kind } : {}),
    ...(cat !== 'all' ? { category: cat } : {}),
    ...(scenario ? { scenario_id: scenario } : {}),
    ...(cursor ? { cursor } : {}),
  });
  const { data, error, loading, isPreviousData } = useQuery<{
    items: AssetResponse[];
    total: number;
    counts: Record<string, number>;
    next_cursor: string | null;
  }>('/api/assets?' + params.toString(), refresh, { keepPreviousData: true });
  const { data: scenarios } = useQuery<ScenarioResponse[]>('/api/scenarios', refresh);
  const suggestionParams = new URLSearchParams({
    ...(kind !== 'all' ? { kind } : {}),
    ...(cat !== 'all' ? { category: cat } : {}),
    ...(scenario ? { scenario_id: scenario } : {}),
  });
  const {
    data: suggestions,
    loading: suggestionsLoading,
    isPreviousData: previousSuggestions,
  } = useQuery<KeywordSuggestionsResponse>(
    '/api/assets/keywords?' + suggestionParams.toString(),
    refresh + suggestionRound,
    { keepPreviousData: true },
  );
  const clear = () => {
    setQuery('');
    setKind('all');
    setCat('all');
    setScenario('');
    setCursor('');
  };
  const filter = (fn: () => void) => {
    fn();
    setCursor('');
  };
  const browsing = !q && kind === 'all' && cat === 'all' && !scenario;
  return (
    <div className={discoverStyles}>
      <section className={discoverHeroStyles}>
        <div className={cn(dotgridStyles, heroDotsStyles)} />
        <div className={heroOrbStyles} />
        <div className={heroCopyStyles}>
          <p className={eyebrowStyles}>
            <span className={liveDotStyles} />
            SKILLS & MCP
          </p>
          <h1>发现和使用 Skill 与 MCP</h1>
          <p className={heroDescriptionStyles}>
            查找适用于当前任务的资源，下载指定版本或通过 Agent 安装。
          </p>
          <div className={catalogSearchStyles}>
            <Search size={20} className={catalogSearchIconStyles} aria-hidden="true" />
            <input
              id="discover-search"
              ref={searchInput}
              aria-label="搜索 Skill 与 MCP"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              maxLength={500}
              placeholder="搜索名称、关键词或任务…"
              enterKeyHint="search"
              autoComplete="off"
            />
            <span className={catalogSearchActionStyles}>
              {query ? (
                <button
                  type="button"
                  className={catalogSearchClearStyles}
                  aria-label="清除搜索"
                  onClick={() => {
                    setQuery('');
                    searchInput.current?.focus();
                  }}
                >
                  <X size={16} aria-hidden="true" />
                </button>
              ) : (
                <kbd aria-hidden="true">/</kbd>
              )}
            </span>
          </div>
          <div
            className={quickSearchStyles}
            aria-label="动态推荐关键词"
            aria-busy={suggestionsLoading}
            inert={previousSuggestions}
          >
            <AnimatePresence mode="popLayout">
              {!!suggestions?.items.length && (
                <CatalogMotionItem key="label" className={quickSearchItemStyles}>
                  <span>推荐关键词</span>
                </CatalogMotionItem>
              )}
              {suggestions?.items.map((item, index) => (
                <CatalogMotionItem
                  key={'keyword:' + item.keyword}
                  className={quickSearchItemStyles}
                  index={index}
                >
                  <button
                    onClick={() => setQuery(item.keyword)}
                    title={`${item.reason === 'popular' ? '常用' : '探索'} · ${item.asset_count} 份可见资源`}
                  >
                    {item.keyword}
                    <ArrowUpRight size={12} />
                  </button>
                </CatalogMotionItem>
              ))}
              {!!suggestions?.items.length && (
                <CatalogMotionItem key="refresh" className={quickSearchItemStyles}>
                  <button
                    type="button"
                    onClick={() => setSuggestionRound((round) => round + 1)}
                    disabled={suggestionsLoading}
                    aria-label="换一组推荐关键词"
                  >
                    <RefreshCw
                      size={12}
                      className={suggestionsLoading ? keywordRefreshingStyles : ''}
                    />
                    换一组
                  </button>
                </CatalogMotionItem>
              )}
            </AnimatePresence>
          </div>
        </div>
        <div className={heroArtStyles} aria-hidden="true">
          <svg className={orbitLineStyles} viewBox="0 0 240 140">
            <ellipse className={orbitTrackStyles} cx="120" cy="70" rx="119" ry="69" />
            <ellipse
              className={orbitSignalStyles}
              cx="120"
              cy="70"
              rx="119"
              ry="69"
              pathLength="100"
            />
          </svg>
          <div className={cn(orbitTileStyles, tileMainStyles)}>
            <Glyph seed="capability-hub-hero" kind="skill" size={70} />
            <span>Skill</span>
          </div>
          <div className={cn(orbitTileStyles, tileMcpStyles)}>
            <Plug size={32} />
            <span>MCP</span>
          </div>
          <span className={cn(artCrossStyles, cross1Styles)}>+</span>
          <span className={cn(artCrossStyles, cross2Styles)}>+</span>
        </div>
      </section>
      <div className={catalogToolbarStyles}>
        <div>
          <p className={eyebrowStyles}>EXPLORE THE REGISTRY</p>
          <h2>
            {q ? '搜索结果' : '资源目录'}
            <span className={countPillStyles}>{data?.total ?? '—'}</span>
          </h2>
        </div>
        <Segmented
          id="kind"
          label="资产类型"
          value={kind}
          onChange={(v) => filter(() => setKind(v))}
          options={[
            { id: 'all', label: '全部' },
            {
              id: 'skill',
              label: (
                <span className={inlineIconStyles}>
                  <FileCode2 size={14} />
                  Skills
                </span>
              ),
            },
            {
              id: 'mcp',
              label: (
                <span className={inlineIconStyles}>
                  <Plug size={14} />
                  MCP
                </span>
              ),
            },
          ]}
        />
      </div>
      <div className={catalogFiltersStyles}>
        <div className={filterTabsStyles} role="group" aria-label="分类筛选">
          {[
            ['all', '全部'],
            ['general', '通用'],
            ['scenario', '场景'],
            ['uncategorized', '未分类'],
          ].map(([id, label]) => (
            <button
              key={id}
              aria-pressed={cat === id}
              onClick={() => filter(() => setCat(id))}
              className={cat === id ? selectedStyles : ''}
            >
              {label}
              <span>{data?.counts[id] ?? 0}</span>
            </button>
          ))}
        </div>
        {!!scenarios?.length && (
          <label className={scenarioFilterStyles}>
            <SlidersHorizontal size={14} />
            <SelectField
              aria-label="场景筛选"
              value={scenario}
              onValueChange={(nextValue) => filter(() => setScenario(nextValue))}
            >
              <option value="">全部场景</option>
              {scenarios.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </SelectField>
          </label>
        )}
      </div>
      <QueryRegion
        label="资源结果"
        loading={loading}
        isPreviousData={isPreviousData}
        className={catalogResultsStyles}
      >
        <div className={assetGridStyles} aria-busy={loading}>
          <AnimatePresence mode="popLayout">
            {error ? (
              <CatalogMotionItem key="error" className={catalogResultStateStyles}>
                <ErrorState message={error} retry={reload} />
              </CatalogMotionItem>
            ) : loading && !data ? (
              <CatalogMotionItem key="loading" className={catalogResultStateStyles}>
                <CardGridSkeleton count={6} />
              </CatalogMotionItem>
            ) : !data?.items.length ? (
              <CatalogMotionItem key="empty" className={catalogResultStateStyles}>
                <CatalogEmptyState browsing={browsing} onClear={clear} />
              </CatalogMotionItem>
            ) : (
              data.items.map((a, index) => (
                <CatalogMotionItem
                  key={'asset:' + a.asset_id}
                  className={assetGridItemStyles}
                  index={index}
                >
                  <a href={assetHref(a.slug)} className={assetCardStyles}>
                    <div className={assetCardTopStyles}>
                      <span className={cn(assetSymbolStyles, `group/${a.kind}`)}>
                        <Glyph seed={a.content_digest} kind={a.kind} size={39} />
                      </span>
                      <span className={cn(typeLabelStyles, `group/${a.kind}`)}>
                        {a.kind === 'skill' ? 'SKILL' : 'MCP'}
                      </span>
                      <ArrowUpRight size={17} className={cardArrowStyles} />
                    </div>
                    <h3 title={a.slug}>{a.slug}</h3>
                    <span
                      className={cn(assetVersionStyles, monoStyles)}
                      title={a.current_release.version_label}
                    >
                      {a.current_release.version_label.startsWith('git.')
                        ? a.current_release.version_label.slice(0, 12) + '…'
                        : 'v' + a.current_release.version_label}
                    </span>
                    <p>{a.description}</p>
                    <div className={assetCardMetaStyles}>
                      <div className={cn(chipsStyles, assetCardTagsStyles)}>
                        <span
                          className={cn(
                            tagStyles,
                            a.current_release.category === 'general' ? tagTealStyles : '',
                          )}
                        >
                          {categoryLabel(a.current_release.category)}
                        </span>
                        {[
                          ...new Set([
                            ...(a.applies_to.languages ?? []),
                            ...(a.applies_to.frameworks ?? []),
                            ...(a.applies_to.keywords ?? []),
                          ]),
                        ]
                          .slice(0, 2)
                          .map((t) => (
                            <span className={tagStyles} key={t}>
                              {t}
                            </span>
                          ))}
                        {a.current_release.has_scripts && <ScriptBadge />}
                      </div>
                      {q && a.match_reasons?.length ? (
                        <small className={matchReasonStyles}>{a.match_reasons.join(' · ')}</small>
                      ) : null}
                    </div>
                    <div className={assetCardFootStyles}>
                      {!!a.community.recommendation_count && (
                        <span className={cardRecommendationsStyles} title="此版本获得的用户推荐">
                          <ThumbsUp size={13} />
                          {a.community.recommendation_count}
                        </span>
                      )}
                      <span className={assetOwnerStyles} title={a.owner.name}>
                        <span className={ownerAvatarStyles} aria-hidden="true">
                          {a.owner.name.slice(0, 1)}
                        </span>
                        <span className={assetOwnerNameStyles}>{a.owner.name}</span>
                      </span>
                      <span
                        className={audienceLabelStyles}
                        title={'可见范围：' + a.current_release.visibility_label}
                      >
                        {a.current_release.visibility_label === a.owner.name
                          ? '团队可见'
                          : a.current_release.visibility_label}
                      </span>
                    </div>
                  </a>
                </CatalogMotionItem>
              ))
            )}
          </AnimatePresence>
        </div>
        {data?.next_cursor && (
          <div className={paginationStyles}>
            <button
              className={btnStyles}
              disabled={loading}
              onClick={() => {
                setCursor(data.next_cursor!);
                window.scrollTo({ top: 380, behavior: 'smooth' });
              }}
            >
              下一页
              <ArrowRight size={15} />
            </button>
          </div>
        )}
        {cursor && (
          <button className={textBtnStyles} disabled={loading} onClick={() => setCursor('')}>
            返回第一页
          </button>
        )}
      </QueryRegion>
      <div className={catalogNoteStyles}>
        <ShieldCheck size={15} />
        <span>所有资源均经过审核，并保留来源与版本记录。</span>
      </div>
      <Overlay
        open={!!openAsset}
        onClose={() => navigate('/discover')}
        label="资源详情"
        variant="sheet"
        size="wide"
        loadingKey={openAsset}
      >
        <DialogTitle title="资源详情" onClose={() => navigate('/discover')} />
        <div className={cn(sheetScrollStyles, assetDetailScrollStyles)}>
          <Suspense fallback={<DetailSkeleton />}>
            {openAsset && <AssetSheet key={openAsset} slug={openAsset} />}
          </Suspense>
        </div>
      </Overlay>
    </div>
  );
}
