/**
 * 资源发现页（`/`）：首屏按任务提问，提交后原地给出回应、方向或固定版本结果；
 * 下方资源目录继续提供与检索模型无关的类型、分类、场景筛选和游标分页。
 * 依赖 `GET /api/catalog/discovery`（入口模式与开场提示）、`POST /api/catalog/discovery/turn`
 * 与目录自己的 `GET /api/assets`、`GET /api/scenarios`、`GET /api/catalog/keywords`。
 */
import type { AssetResponse, KeywordSuggestionsResponse } from '@capability-hub/contracts/http';
import type { ScenarioResponse } from '@capability-hub/contracts/http';
import { AnimatePresence } from 'motion/react';
import { memo, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { cn } from '../../shared/styles/cn.js';
import { assetHref } from '../../shared/navigation/history-route.js';
import {
  ArrowRight,
  ArrowUpRight,
  Blocks,
  Building2,
  FileCode,
  Globe,
  LockKeyhole,
  Plug,
  UsersRound,
  X,
} from '../../shared/icons/lucide.js';
import { useQuery } from '../../shared/api/use-query.js';
import { ErrorState } from '../../shared/components/ErrorState.js';
import { Glyph } from '../../shared/components/Glyph.js';
import { VersionLabel } from '../../shared/components/VersionLabel.js';
import { isGeneratedGitVersion } from '../../shared/format/version-label.js';
import { Segmented } from '../../shared/components/Segmented.js';
import { SelectField } from '../../shared/components/SelectField.js';
import { InputField } from '../../shared/components/InputField.js';
import { CardGridSkeleton } from '../../shared/components/Skeleton.js';
import { QueryRegion } from '../../shared/components/QueryRegion.js';
import { useHub } from '../../shared/context/HubContext.js';
import { categoryLabel } from '../../shared/format/labels.js';
import { CatalogMotionItem } from './CatalogMotionItem.js';
import { ApiKeyBadge } from './ApiKeyBadge.js';
import { CatalogEmptyState } from './CatalogEmptyState.js';
import { CatalogOnboarding } from './CatalogOnboarding.js';
import { BlurText } from '../../shared/components/react-bits/BlurText.js';
import { CountUp } from '../../shared/components/react-bits/CountUp.js';
import { DecryptedText } from '../../shared/components/react-bits/DecryptedText.js';
import { DotGrid, type DotGridHandle } from '../../shared/components/react-bits/DotGrid.js';
import { LogoLoop } from '../../shared/components/react-bits/LogoLoop.js';
import { SpotlightCard } from '../../shared/components/react-bits/SpotlightCard.js';
import { useDiscovery } from './use-discovery.js';
import { TaskComposer, TaskPanel } from './TaskDiscovery.js';
import {
  cardFeatureTagStyles,
  cardFootItemStyles,
  cardFootStyles,
  cardGlyphStyles,
  cardMetaStyles,
  cardOpenIconStyles,
  cardScopeStyles,
  cardTagRowStyles,
  cardTagStyles,
  cardTitleColStyles,
  cardTopStyles,
  cardTypeChipMcpStyles,
  cardTypeChipStyles,
  capabilityTickerStyles,
  directoryCardStyles,
  directoryCountStyles,
  directoryEyebrowLabelStyles,
  directoryEyebrowRuleStyles,
  directoryEyebrowStyles,
  directoryGridStyles,
  directoryHeadCopyStyles,
  directoryHeadStyles,
  directoryStyles,
  directorySubStyles,
  directoryTabCountActiveStyles,
  directoryTabCountStyles,
  directoryTabsStyles,
  directoryTitleStyles,
  directoryToolsStyles,
  discoverHeroStyles,
  discoverStyles,
  filterRowStyles,
  heroCopyStyles,
  heroDotsStyles,
  heroIntroStyles,
  heroStageStyles,
  heroEyebrowRuleStyles,
  heroEyebrowStyles,
  heroEyebrowSubStyles,
  heroTitleAccentStyles,
  heroTitleStyles,
  heroTitleSubStyles,
  keywordClearStyles,
  keywordFieldStyles,
  keywordInputStyles,
  paginationStyles,
  scenarioActiveStyles,
  scenarioSelectStyles,
  tickerGlyphStyles,
  tickerLinkStyles,
  typeSegmentedIndicatorStyles,
  typeSegmentedItemStyles,
  typeSegmentedStyles,
} from './styles.js';
import { btnStyles } from '../../shared/styles/recipes.js';

/** 发现页正文：任务提问在上，独立的资源目录在下；目录筛选变化即重置游标。 */
export default function DiscoverPage() {
  const composer = useRef<HTMLTextAreaElement>(null);
  const grid = useRef<DotGridHandle>(null);
  const directory = useRef<HTMLHeadingElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState(''),
    [q, setQ] = useState(''),
    [kind, setKind] = useState('all'),
    [cat, setCat] = useState('all'),
    [scenario, setScenario] = useState(''),
    [cursor, setCursor] = useState('');
  const { refresh, reload } = useHub();
  const discovery = useDiscovery(refresh);
  useEffect(() => {
    const timer = setTimeout(() => {
      setQ(query);
      setCursor('');
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const editable =
        !!target &&
        (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable);
      if (
        event.key === '/' &&
        !event.isComposing &&
        !editable &&
        !document.querySelector('[role=dialog]')
      ) {
        event.preventDefault();
        composer.current?.focus();
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
  const { data, error, errorProps, loading, isPreviousData } = useQuery<{
    items: AssetResponse[];
    total: number;
    counts: Record<string, number>;
    next_cursor: string | null;
  }>('/api/assets?' + params.toString(), refresh, { keepPreviousData: true });
  const { data: scenarios } = useQuery<ScenarioResponse[]>('/api/scenarios', refresh);
  const clear = () => {
    setQuery('');
    setKind('all');
    setCat('all');
    setScenario('');
    setCursor('');
  };
  const filter = (apply: () => void) => {
    apply();
    setCursor('');
  };
  const browse = () => {
    const heading = directory.current;
    heading?.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'instant'
        : 'smooth',
      block: 'start',
    });
    heading?.focus({ preventScroll: true });
  };
  const browsing = !q && kind === 'all' && cat === 'all' && !scenario;
  // 只在没有筛选且拿到本次结果时判定目录为空，筛选切换的过渡期不会闪出引导。
  const empty = browsing && !isPreviousData && data?.total === 0;
  const directoryTotal = data?.total;
  const busy = discovery.status === 'thinking';
  const engaged = !!discovery.task || busy || !!discovery.error || !!discovery.notice;
  const tickerAssets = useMemo(() => data?.items.slice(0, 12) ?? [], [data]);
  const { data: topics } = useQuery<KeywordSuggestionsResponse>(
    discovery.entry && !discovery.entry.suggestions.length && data && !empty
      ? '/api/catalog/keywords?limit=6'
      : null,
    refresh,
  );
  useEffect(() => {
    // 标题入场后点阵从输入框扫出一圈；之后只在查找中回响，不在输入或空闲时打扰。
    const first = setTimeout(() => rippleFromComposer(grid, composer, 0.8), 900);
    return () => clearTimeout(first);
  }, []);
  useEffect(() => {
    if (!busy) return;
    rippleFromComposer(grid, composer, 1);
    const timer = setInterval(() => rippleFromComposer(grid, composer, 0.6), 1400);
    return () => clearInterval(timer);
  }, [busy]);
  return (
    <div className={discoverStyles}>
      <div
        className="group/hero relative isolate flex min-w-0 flex-col"
        data-discover-stage=""
        data-engaged={engaged || undefined}
      >
        <div className={heroStageStyles} aria-hidden="true">
          <DotGrid ref={grid} className={heroDotsStyles} />
        </div>
        <section className={discoverHeroStyles} aria-label="按任务找资源">
          <div className={heroIntroStyles}>
            <div className={heroCopyStyles}>
              <p className={heroEyebrowStyles}>
                <span>
                  <DecryptedText text="CAPABILITY LAYER" reveal />
                </span>
                <span className={heroEyebrowRuleStyles} aria-hidden="true" />
                <span className={heroEyebrowSubStyles}>
                  <DecryptedText text="SKILLS & MCP" reveal />
                </span>
              </p>
              <h1 className={heroTitleStyles}>
                <BlurText text="团队沉淀的能力" delay={0.05} />
                <BlurText
                  text="说出要做的事，一句话就能找到"
                  delay={0.3}
                  className={heroTitleSubStyles}
                  pieceClassName={heroTitleAccentStyles}
                />
              </h1>
            </div>
          </div>
          <TaskComposer
            entry={discovery.entry}
            draft={discovery.draft}
            busy={busy}
            total={directoryTotal}
            onDraft={discovery.setDraft}
            onSubmit={discovery.submit}
            onStop={discovery.stop}
            onSuggestion={(suggestion) => {
              discovery.setDraft(suggestion.text, suggestion);
              composer.current?.focus();
            }}
            topics={discovery.entry ? (topics?.items.map((item) => item.keyword) ?? []) : []}
            onTopic={(keyword) => {
              discovery.setDraft(keyword, null);
              composer.current?.focus();
            }}
            onBrowse={empty ? undefined : browse}
            inputRef={composer}
            restart={!!discovery.task?.context && discovery.entry?.mode === 'dialogue'}
          />
          {discovery.entryError && (
            <ErrorState
              message={discovery.entryError}
              {...discovery.entryErrorProps}
              retry={discovery.reloadEntry}
            />
          )}
        </section>
        <AnimatePresence>
          {engaged && (
            <TaskPanel
              key="task"
              state={discovery}
              scenarios={scenarios?.map(({ id, name }) => ({ id, name })) ?? []}
              onPick={discovery.pick}
              onFilter={discovery.applyFilter}
              onFollow={discovery.followUp}
              onFollowChange={discovery.setFollow}
              onRetry={discovery.retry}
              onEditQuestion={(question) => {
                discovery.setDraft(question, null);
                composer.current?.focus();
              }}
              onBrowse={browse}
            />
          )}
        </AnimatePresence>
      </div>
      {!empty && (!data || tickerAssets.length > 0) && (
        <section className={capabilityTickerStyles} aria-label="目录资源速览">
          <CapabilityTicker assets={tickerAssets} />
        </section>
      )}
      {empty ? (
        <CatalogOnboarding headingRef={directory} />
      ) : (
        <section className={directoryStyles} aria-label="资源目录">
          <div className={directoryHeadStyles}>
            <div className={directoryHeadCopyStyles}>
              <p className={directoryEyebrowStyles}>
                <span className={directoryEyebrowLabelStyles}>EXPLORE THE REGISTRY</span>
                <span className={directoryEyebrowRuleStyles} aria-hidden="true" />
              </p>
              <h2
                ref={directory}
                tabIndex={-1}
                className={directoryTitleStyles}
                id="directory-title"
              >
                {q ? '搜索结果' : '资源目录'}
                <span className={directoryCountStyles}>
                  {data ? <CountUp value={data.total} /> : '—'}
                </span>
              </h2>
              <p className={directorySubStyles}>
                按组织、场景与可见范围浏览全部 Skill 与 MCP；下拉筛选不依赖检索模型。
              </p>
            </div>
            <Segmented
              id="kind"
              label="资产类型"
              value={kind}
              onChange={(value) => filter(() => setKind(value))}
              className={typeSegmentedStyles}
              indicatorClassName={typeSegmentedIndicatorStyles}
              itemClassName={typeSegmentedItemStyles}
              options={[
                { id: 'all', label: '全部' },
                {
                  id: 'skill',
                  label: (
                    <span className="inline-flex items-center gap-1.5">
                      <Blocks size={12} className="text-quieter" />
                      Skills
                    </span>
                  ),
                },
                {
                  id: 'mcp',
                  label: (
                    <span className="inline-flex items-center gap-1.5">
                      <Plug size={12} className="text-quieter" />
                      MCP
                    </span>
                  ),
                },
              ]}
            />
          </div>
          <div className={filterRowStyles}>
            <div className={directoryTabsStyles} role="group" aria-label="分类筛选">
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
                  className={cat === id ? 'group/selected' : ''}
                >
                  {label}
                  <span
                    className={cat === id ? directoryTabCountActiveStyles : directoryTabCountStyles}
                  >
                    {data?.counts[id] ?? 0}
                  </span>
                </button>
              ))}
            </div>
            <div className={directoryToolsStyles} role="search" aria-label="目录内搜索">
              <span className={keywordFieldStyles}>
                <InputField
                  ref={searchInput}
                  icon="search"
                  type="search"
                  aria-label="按关键词搜索目录"
                  placeholder="名称或关键词"
                  spellCheck={false}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  maxLength={500}
                  autoComplete="off"
                  onKeyDown={(event) => {
                    if (event.key === 'Escape' && !event.nativeEvent.isComposing) {
                      event.preventDefault();
                      setQuery('');
                    }
                  }}
                  className={keywordInputStyles}
                  trailing={
                    query && (
                      <button
                        type="button"
                        aria-label="清除关键词"
                        className={keywordClearStyles}
                        onClick={() => {
                          setQuery('');
                          searchInput.current?.focus();
                        }}
                      >
                        <X size={14} aria-hidden="true" />
                      </button>
                    )
                  }
                />
              </span>
              {!!scenarios?.length && (
                <SelectField
                  aria-label="场景筛选"
                  value={scenario}
                  onValueChange={(next) => filter(() => setScenario(next))}
                  className={cn(scenarioSelectStyles, scenario && scenarioActiveStyles)}
                >
                  <option value="">全部场景</option>
                  {scenarios.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </SelectField>
              )}
            </div>
          </div>
          <QueryRegion
            label="资源结果"
            loading={loading}
            isPreviousData={isPreviousData}
            className="min-w-0"
          >
            <div className={directoryGridStyles} aria-busy={loading}>
              {error ? (
                <div className="[grid-column:1_/_-1]">
                  <ErrorState message={error} {...errorProps} retry={reload} />
                </div>
              ) : loading && !data ? (
                <div className="[grid-column:1_/_-1]">
                  <CardGridSkeleton count={6} />
                </div>
              ) : !data?.items.length ? (
                <div className="[grid-column:1_/_-1]">
                  <CatalogEmptyState onClear={clear} />
                </div>
              ) : (
                data.items.map((asset, index) => (
                  <CatalogMotionItem
                    key={'asset:' + asset.asset_id}
                    className="min-w-0"
                    index={index}
                    animateLayout={false}
                  >
                    <AssetCard asset={asset} />
                  </CatalogMotionItem>
                ))
              )}
            </div>
            {(!!data?.next_cursor || !!cursor) && (
              <div className={paginationStyles}>
                {cursor && (
                  <button className={btnStyles} disabled={loading} onClick={() => setCursor('')}>
                    返回第一页
                  </button>
                )}
                {data?.next_cursor && (
                  <button
                    className={btnStyles}
                    disabled={loading}
                    onClick={() => {
                      setCursor(data.next_cursor!);
                      browse();
                    }}
                  >
                    下一页
                    <ArrowRight size={15} />
                  </button>
                )}
              </div>
            )}
          </QueryRegion>
        </section>
      )}
    </div>
  );
}

/** 以首页输入框中心为圆心，向舞台点阵推出一圈波纹；输入框滚出视口时不发。 */
function rippleFromComposer(
  grid: RefObject<DotGridHandle | null>,
  input: RefObject<HTMLTextAreaElement | null>,
  strength: number,
) {
  const rect = input.current?.closest('form')?.getBoundingClientRect();
  if (!rect || rect.bottom < 0 || rect.top > window.innerHeight) return;
  grid.current?.ripple(rect.left + rect.width / 2, rect.top + rect.height / 2, strength);
}

/** 能力横条单独记忆：输入框每次按键都会重渲染整页，条目不变时横条不重渲染、不重新测量。 */
const CapabilityTicker = memo(function CapabilityTicker({ assets }: { assets: AssetResponse[] }) {
  return (
    <LogoLoop
      className="w-full"
      items={assets.map((asset) => ({
        key: asset.asset_id,
        node: (
          <a href={assetHref(asset.slug)} className={tickerLinkStyles}>
            <span aria-hidden="true" className={tickerGlyphStyles}>
              <Glyph seed={asset.content_digest} kind={asset.kind} size={14} />
            </span>
            {asset.slug}
          </a>
        ),
      }))}
    />
  );
});

function AssetCard({ asset }: { asset: AssetResponse }) {
  const release = asset.current_release;
  const version = release.version_label;
  const isGit = isGeneratedGitVersion(version);
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
    <SpotlightCard
      href={assetHref(asset.slug)}
      className={cn(directoryCardStyles, asset.kind === 'mcp' && 'mcp')}
    >
      <div className={cardTopStyles}>
        <span className={cardGlyphStyles} aria-hidden="true">
          <Glyph seed={asset.content_digest} kind={asset.kind} size={17} />
        </span>
        <div className={cardTitleColStyles}>
          <h3 title={asset.slug}>{asset.slug}</h3>
          <div className={cardMetaStyles}>
            <span className={asset.kind === 'mcp' ? cardTypeChipMcpStyles : cardTypeChipStyles}>
              {asset.kind === 'skill' ? 'SKILL' : 'MCP'}
            </span>
            <span className={cardScopeStyles}>
              {categoryLabel(release.category)} ·{' '}
              <VersionLabel value={isGit ? version : `v${version}`} />
            </span>
          </div>
        </div>
        <ArrowUpRight size={14} className={cardOpenIconStyles} aria-hidden="true" />
      </div>
      <p title={asset.description}>{asset.description}</p>
      <div className={cardTagRowStyles}>
        {release.has_scripts && (
          <span className={cardFeatureTagStyles}>
            <FileCode size={10} aria-hidden="true" />
            含脚本
          </span>
        )}
        {asset.kind === 'skill' && asset.requires_api_key && <ApiKeyBadge />}
        {keywords.map((keyword) => (
          <span className={cardTagStyles} key={keyword}>
            {keyword}
          </span>
        ))}
      </div>
      <div className={cardFootStyles}>
        <span className={cardFootItemStyles} title={asset.owner.name}>
          <Building2 size={11} aria-hidden="true" />
          <span className="truncate">{asset.owner.name}</span>
        </span>
        <span className={cardFootItemStyles} title={'可见范围：' + release.visibility_label}>
          <AudienceIcon size={11} aria-hidden="true" />
          <span className="sr-only">可见范围：</span>
          <span className="truncate">{ownerOnly ? '团队可见' : release.visibility_label}</span>
        </span>
      </div>
    </SpotlightCard>
  );
}
