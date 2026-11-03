/**
 * 目录发现页（`/`）：搜索、关键词建议、类型/分类/场景筛选与游标分页的入口。
 * 依赖 `GET /api/assets`（`limit` 固定 18，用 `cursor` 翻页）、`GET /api/scenarios`
 * 与 `GET /api/assets/keywords`；输入 250ms 防抖后才发请求，且 `/` 键在无弹层时聚焦搜索框。
 */
import {
  discoverStyles,
  discoverHeroStyles,
  heroDotsStyles,
  heroOrbStyles,
  heroCopyStyles,
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
  assetCardCornerDotsStyles,
  assetCardPixelRevealStyles,
  assetCardTopStyles,
  assetSymbolStyles,
  typeLabelStyles,
  assetCardSubtitleStyles,
  cardArrowStyles,
  assetVersionStyles,
  assetCardTagsStyles,
  matchReasonStyles,
  assetCardFootStyles,
  cardRecommendationsStyles,
  assetOwnerStyles,
  ownerAvatarStyles,
  assetOwnerNameStyles,
  audienceLabelStyles,
  paginationStyles,
} from './styles.js';
import {
  dotgridStyles,
  eyebrowStyles,
  countPillStyles,
  inlineIconStyles,
  filterTabsStyles,
  selectedStyles,
  chipsStyles,
  tagStyles,
  btnStyles,
  textBtnStyles,
} from '../../shared/styles/recipes.js';
import { cn } from '../../shared/styles/cn.js';
import { ApiKeyBadge } from './ApiKeyBadge.js';
import {
  type AssetResponse,
  type KeywordSuggestionsResponse,
} from '@capability-hub/contracts/http';
import type { ScenarioResponse } from '@capability-hub/contracts/http';
import {
  ArrowRight,
  ArrowUpRight,
  FileCode2,
  GitCommitHorizontal,
  Globe,
  LockKeyhole,
  Plug,
  Search,
  RefreshCw,
  SlidersHorizontal,
  Tag,
  ThumbsUp,
  UsersRound,
  X,
} from '../../shared/icons/lucide.js';
import { AnimatePresence } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { useQuery } from '../../shared/api/use-query.js';
import { ErrorState } from '../../shared/components/ErrorState.js';
import { Glyph } from '../../shared/components/Glyph.js';
import { Segmented } from '../../shared/components/Segmented.js';
import { SelectField } from '../../shared/components/SelectField.js';
import { CardGridSkeleton } from '../../shared/components/Skeleton.js';
import { PageHead } from '../../shared/components/PageHead.js';
import { QueryRegion } from '../../shared/components/QueryRegion.js';
import { ScriptBadge } from '../../shared/components/ScriptBadge.js';
import { useHub } from '../../shared/context/HubContext.js';
import { categoryLabel } from '../../shared/format/labels.js';
import { assetHref } from '../../shared/navigation/history-route.js';
import { CatalogMotionItem } from './CatalogMotionItem.js';
import { CatalogEmptyState } from './CatalogEmptyState.js';

/** 目录发现页正文：筛选变化即重置游标，翻页只追加当前条件的结果。 */
export default function DiscoverPage() {
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
          <PageHead
            title="发现和使用 Skill 与 MCP"
            eyebrow="SKILLS & MCP"
            description="查找适用于当前任务的资源，下载指定版本或通过 Agent 安装。"
          />
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
                  <AssetCard asset={a} searching={!!q} />
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
    </div>
  );
}

function AssetCard({ asset, searching }: { asset: AssetResponse; searching: boolean }) {
  const release = asset.current_release;
  const version = release.version_label;
  const isGit = version.startsWith('git.');
  const VersionIcon = isGit ? GitCommitHorizontal : Tag;
  const audience = release.distribution.audience;
  const isPublic = audience.includes('public');
  const AudienceIcon = isPublic
    ? Globe
    : audience.includes('organization')
      ? LockKeyhole
      : UsersRound;
  const ownerOnly = audience.length === 1 && audience[0] === `group:${asset.owner.id}`;
  const keywords = [
    ...new Set([
      ...(asset.applies_to.languages ?? []),
      ...(asset.applies_to.frameworks ?? []),
      ...(asset.applies_to.keywords ?? []),
    ]),
  ].slice(0, 2);

  return (
    <a href={assetHref(asset.slug)} className={assetCardStyles}>
      <span aria-hidden="true" className={cn(dotgridStyles, assetCardCornerDotsStyles)} />
      <div className={assetCardTopStyles}>
        <span className={cn(assetSymbolStyles, `group/${asset.kind}`)} aria-hidden="true">
          <Glyph
            seed={asset.content_digest}
            kind={asset.kind}
            size={30}
            pixelRevealClassName={assetCardPixelRevealStyles}
          />
        </span>
        <div className="min-w-0">
          <h3 title={asset.slug}>{asset.slug}</h3>
          <div className={assetCardSubtitleStyles}>
            <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
              <span className={cn(typeLabelStyles, 'text-caption', `group/${asset.kind}`)}>
                {asset.kind === 'skill' ? 'SKILL' : 'MCP'}
              </span>
              <span className="opacity-60" aria-hidden="true">
                /
              </span>
              <span className="font-medium text-brand">{categoryLabel(release.category)}</span>
            </span>
            <span className={assetVersionStyles} title={version}>
              <VersionIcon size={13} />
              <span className="sr-only">{isGit ? 'Git 提交 ' : '版本 '}</span>
              <span className="truncate">{isGit ? version.slice(4, 11) : `v${version}`}</span>
            </span>
          </div>
        </div>
        <ArrowUpRight size={16} className={cardArrowStyles} />
      </div>
      <p>{asset.description}</p>
      <div className={cn(chipsStyles, assetCardTagsStyles)}>
        {release.has_scripts && <ScriptBadge />}
        {asset.kind === 'skill' && asset.requires_api_key && <ApiKeyBadge />}
        {keywords.map((keyword) => (
          <span className={tagStyles} key={keyword}>
            {keyword}
          </span>
        ))}
      </div>
      {searching && asset.match_reasons?.length ? (
        <small className={matchReasonStyles}>{asset.match_reasons.join(' · ')}</small>
      ) : null}
      <div className={assetCardFootStyles}>
        {!!asset.community.recommendation_count && (
          <span className={cardRecommendationsStyles} title="此资源获得的用户推荐">
            <ThumbsUp size={13} />
            {asset.community.recommendation_count}
          </span>
        )}
        <span className={assetOwnerStyles} title={asset.owner.name}>
          <span className={ownerAvatarStyles} aria-hidden="true">
            {asset.owner.name.slice(0, 1)}
          </span>
          <span className={assetOwnerNameStyles}>{asset.owner.name}</span>
        </span>
        <span
          className={cn(audienceLabelStyles, !isPublic && 'text-ink')}
          title={'可见范围：' + release.visibility_label}
        >
          <AudienceIcon size={13} />
          <span className="sr-only">可见范围：</span>
          <span className="truncate">{ownerOnly ? '团队可见' : release.visibility_label}</span>
        </span>
      </div>
    </a>
  );
}
