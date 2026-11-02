import type { Principal } from '@capability-hub/domain/identity';
import type { CatalogSearchQuery, KeywordSuggestionsQuery } from './queries.js';
import type { AssetRecord, ReleaseRecord, VersionRecord } from '@capability-hub/domain/models';
import { filterAsync } from '@capability-hub/domain/async';
import { canonical, digest, sha256 } from '@capability-hub/domain/canonical';
import { fail } from '@capability-hub/domain/errors';
import { has } from '@capability-hub/domain/rbac';
import type { CatalogCursorCodec } from '../ports/index.js';
import type { ApplicationContext } from '../shared/application-context.js';
import type { AssetAccessService } from './asset-access-service.js';
import { sharedKeysForOption } from '../credentials/mcp-shared-key-service.js';
import type { AssetCommunityService } from './asset-community-service.js';

const chineseWords = new Intl.Segmenter('zh', { granularity: 'word' });
const han = /\p{Script=Han}/u;
const singleHan = /^\p{Script=Han}$/u;
const queryFillers = new Set(
  '我 我想 想 想要 请 帮 帮我 找 查找 寻找 搜索 需要 适合 使用 可以 一个 相关 有关 的 了 与 和 或 及 是 在 用 给'.split(
    ' ',
  ),
);

function searchTerms(query: string) {
  if (!han.test(query)) return query.split(/\s+/).filter(Boolean);
  const words = new Set<string>();
  for (const part of query.split(/(\p{Script=Han}+)/u)) {
    if (han.test(part)) {
      const terms = Array.from(chineseWords.segment(part), ({ segment }) => segment);
      for (const [index, term] of terms.entries()) {
        if (queryFillers.has(term)) continue;
        if (!singleHan.test(term)) words.add(term);
        else {
          // 分词器未识别的复合词按相邻双字匹配，避免“风控”退化为“风险”或“控制”。
          const next = terms[index + 1];
          if (next && singleHan.test(next) && !queryFillers.has(next)) words.add(term + next);
        }
      }
    } else {
      for (const term of part.match(/[\p{L}\p{M}\p{N}.#+@/_-]+/gu) ?? []) words.add(term);
    }
  }
  return words.size ? [...words] : [query.trim()];
}

/**
 * 只检索当前可分发的发布；缓存不保存用户身份或授权结果。
 *
 * 候选集按 `store.revision()` 缓存，命中缓存时仍对每个主体重算受众过滤，
 * 所以缓存不构成越权路径。各查询入口用 `store.tx` 包住整段读取，让一次请求内的
 * 可见性与分页游标基于同一快照，减少跨查询读到半更新状态的机会。
 */
export class CatalogService {
  private catalogCache: { revision: string; rows: CatalogEntry[] } | undefined;
  constructor(
    private readonly context: ApplicationContext,
    private readonly access: AssetAccessService,
    private readonly community: AssetCommunityService,
    private readonly cursors: CatalogCursorCodec,
  ) {}
  /**
   * 把已解析的发布三元组投影为对外目录视图（详情、搜索结果共用同一形状）。
   *
   * 调用方必须先完成可见性判定（{@link CatalogService.visibleCatalog} 或
   * `requirePublishedAsset`）；本方法不再做受众校验，只计算操作能力：
   * `can_download` 恒为 true，`can_submit`/`can_lifecycle` 分别对应
   * `asset:maintain` 与 `asset:lifecycle`，`can_revoke` 只看全局 `version:revoke`。
   * `replacement_asset_id` 只在替代资源对当前主体也可读时给出，避免泄露不可见
   * 资源的 id；`revision` 原样返回供后续写操作做乐观并发。
   */
  async describeAsset(
    asset: AssetRecord,
    version: VersionRecord,
    release: ReleaseRecord,
    p: Principal | null,
  ) {
    const s = (await this.context.store.get('sources', release.policy_source_id))!;
    const group = await this.context.store.get('groups', asset.owner_group_id);
    return {
      asset_id: asset.id,
      slug: asset.slug,
      kind: asset.kind,
      requires_api_key: asset.requires_api_key === true,
      lifecycle: asset.lifecycle,
      deprecation_reason: asset.deprecation_reason ?? '',
      replacement_asset_id:
        asset.replacement_asset_id &&
        (await (async () => {
          const replacement = await this.context.store.get('assets', asset.replacement_asset_id);
          const rv =
            replacement &&
            (await this.context.store.get('releases', replacement.current_release_id ?? ''));
          return replacement &&
            rv &&
            (await this.access.canRead(
              p,
              replacement,
              (await this.context.store.get('versions', rv.version_id))!,
            ))
            ? replacement.id
            : null;
        })()),
      owner: { id: asset.owner_group_id, name: group?.name ?? '团队' },
      source: { kind: s.kind, repository_url: s.kind === 'git' ? s.canonical_url : undefined },
      description: version.metadata.description,
      applies_to: release.applies_to,
      current_release: {
        visibility_label: await this.access.formatVisibility(release.distribution),
        release_id: release.id,
        version_id: version.id,
        version_label: version.version_label,
        category: release.category,
        scenario_ids: release.scenario_ids,
        distribution: release.distribution,
        published_at: release.published_at,
        has_scripts: version.metadata.has_scripts ?? false,
        has_archives: version.metadata.has_archives ?? false,
      },
      content_digest: version.content_digest,
      artifact_digest: version.artifact_digest,
      files: version.manifest.files,
      installation_options: (version.metadata.installation_options ?? []).map((option) =>
        sharedKeysForOption(asset, option).length ? { ...option, has_shared_key: true } : option,
      ),
      metadata:
        asset.kind === 'mcp'
          ? { registry_name: version.metadata.name, tools_verified: false, declared_tools: [] }
          : {
              compatibility:
                typeof version.metadata.frontmatter?.compatibility === 'string'
                  ? version.metadata.frontmatter.compatibility
                  : '',
            },
      permissions: {
        can_download: true,
        can_submit: !!p && this.access.canMaintain(p, asset),
        can_lifecycle: !!p && has(p, 'asset:lifecycle', this.access.assetContext(asset)),
        can_revoke: !!p && has(p, 'version:revoke'),
      },
      community: await this.community.summary(version.id, release.id, p),
      revision: asset.revision,
    };
  }
  /**
   * 构建与主体无关的候选集，并按 `store.revision()` 记忆化。
   *
   * 只收当前发布处于 `active` 生命周期、版本已 `released`、策略来源未封禁/未撤回分发、
   * 且当前发布与该版本最新发布都是 `approved_audience` 的资源；按发布时间倒序、
   * id 升序排列以保证无关键词查询时的稳定顺序。
   */
  private async getCatalog() {
    const revision = await this.context.store.revision();
    if (this.catalogCache?.revision === revision) return this.catalogCache.rows;
    const rows: CatalogEntry[] = [];
    const scenarios = new Map((await this.context.store.all('scenarios')).map((s) => [s.id, s]));
    for (const a of await this.context.store.all('assets')) {
      if (!a.current_release_id || a.lifecycle !== 'active') continue;
      const r = await this.context.store.get('releases', a.current_release_id),
        v = r && (await this.context.store.get('versions', r.version_id));
      if (!r || !v || v.availability !== 'released') continue;
      const resolved = await this.access.latestReleaseForVersion(v);
      if (!resolved) continue;
      const policySources = await Promise.all(
        [r, resolved].map(
          async (release) => await this.context.store.get('sources', release.policy_source_id),
        ),
      );
      if (
        policySources.some(
          (source) => !source || source.state === 'blocked' || source.distribution_revoked_at,
        ) ||
        [r, resolved].some((release) => release.distribution.mode !== 'approved_audience')
      )
        continue;
      const hints = r.applies_to;
      const tags = Object.values(hints).flat().map(String);
      // 合并链只扩展目录筛选，发布快照和审核授权始终引用原 ID。
      const scenarioIds = new Set(r.scenario_ids);
      for (const id of scenarioIds) {
        const target = scenarios.get(id)?.merged_into;
        if (target) scenarioIds.add(target);
      }
      const labels = [...scenarioIds].map((id) => scenarios.get(id)?.name ?? '');
      rows.push({
        asset: a,
        version: v,
        release: r,
        resolved,
        scenarioIds,
        tags,
        normalizedTags: [...tags, ...labels].map((t) => t.normalize('NFKC').toLowerCase()),
        description: v.metadata.description.normalize('NFKC').toLowerCase(),
      });
    }
    rows.sort(
      (a, b) =>
        b.release.published_at.localeCompare(a.release.published_at) ||
        a.asset.id.localeCompare(b.asset.id),
    );
    this.catalogCache = { revision, rows };
    return rows;
  }
  /**
   * 在候选集上叠加主体条件：匿名主体按 `public` 受众裁剪，`active === false` 的主体
   * 看不到任何条目。
   *
   * 当前发布与该版本最新发布必须同时对主体匹配受众，即“历史版本受两重受众约束”，
   * 所以可见集合是两次受众判定的交集，任一发布把主体排除即不可见。
   */
  private async visibleCatalog(p: Principal | null) {
    return await filterAsync(
      await this.getCatalog(),
      async (row) =>
        (!p || p.active) &&
        (await this.access.matchesAudience(p, row.release)) &&
        (await this.access.matchesAudience(p, row.resolved)),
    );
  }
  /**
   * 列出启用中的场景，唯一入口是这里的 `store.tx` 包裹。
   *
   * 已登录取全部启用场景；匿名主体只看到至少被一条可见发布引用的场景，
   * 否则场景名本身会暴露未公开内容的存在。停用场景任何情况下都不返回。
   */
  listScenarios(p: Principal | null) {
    return this.context.store.tx(() => this.listScenariosSnapshot(p));
  }
  /**
   * 必须在 {@link CatalogService.listScenarios} 打开的事务内调用，才能与可见性判定
   * 读到同一份场景与发布数据。
   */
  private async listScenariosSnapshot(p: Principal | null) {
    const visibleIds = new Set(
      (await this.visibleCatalog(p)).flatMap((row) => [...row.scenarioIds]),
    );
    return (await this.context.store.all('scenarios')).filter(
      (s) => s.active && (p || visibleIds.has(s.id)),
    );
  }
  /**
   * 关键词联想，只从当前主体可见发布的 `applies_to` 标签里统计。
   *
   * 名额分配固定：前 `ceil(limit * 2 / 3)` 个（至少 1 个）按 log(count) 与近 30 天
   * 新鲜度排序，剩余名额用指数竞赛做加权无放回抽样，让低频但近期的关键词也有曝光。
   * `random` 注入用于让抽样结果可复现；`limit` 缺省为 8。
   */
  suggestKeywords(p: Principal | null, input: KeywordSuggestionsQuery, random = Math.random) {
    return this.context.store.tx(() => this.suggestKeywordsSnapshot(p, input, random));
  }
  /**
   * 必须在 {@link CatalogService.suggestKeywords} 的事务内运行；`kind`/`category`/
   * `scenario_id` 是过滤条件，不参与排序权重。
   */
  private async suggestKeywordsSnapshot(
    p: Principal | null,
    input: KeywordSuggestionsQuery,
    random = Math.random,
  ) {
    const query = { ...input, limit: input.limit ?? 8 };
    const terms = new Map<
      string,
      {
        keyword: string;
        count: number;
        freshness: number;
      }
    >();
    for (const row of await this.visibleCatalog(p)) {
      if (query.kind && row.asset.kind !== query.kind) continue;
      if (query.category && row.release.category !== query.category) continue;
      if (query.scenario_id && !row.scenarioIds.has(query.scenario_id)) continue;
      const ageDays = Math.max(0, (Date.now() - Date.parse(row.release.published_at)) / 86400000);
      const freshness = 2 ** (-ageDays / 30);
      const unique = new Map(
        row.tags.map((tag) => [tag.normalize('NFKC').trim().toLowerCase(), tag]),
      );
      for (const [key, keyword] of unique) {
        const term = terms.get(key) ?? { keyword, count: 0, freshness: 0 };
        term.count++;
        term.freshness += freshness;
        terms.set(key, term);
      }
    }
    const ranked = [...terms.values()]
      .map((term) => ({
        ...term,
        score: Math.log1p(term.count) * (1 + (0.25 * term.freshness) / term.count),
      }))
      .sort((a, b) => b.score - a.score || a.keyword.localeCompare(b.keyword));
    // 三分之一名额用于加权无放回抽样，使低频和近期关键词也能出现。
    const popularCount = Math.min(ranked.length, Math.max(1, Math.ceil((query.limit * 2) / 3)));
    const popular = ranked.slice(0, popularCount);
    const discovery = ranked
      .slice(popularCount)
      .map((term) => ({
        ...term,
        draw:
          -Math.log(Math.max(Number.MIN_VALUE, random())) /
          ((1 + (0.5 * term.freshness) / term.count) / Math.sqrt(term.count)),
      }))
      .sort((a, b) => a.draw - b.draw || a.keyword.localeCompare(b.keyword))
      .slice(0, query.limit - popular.length);
    return {
      items: [
        ...popular.map((term) => ({
          keyword: term.keyword,
          asset_count: term.count,
          reason: 'popular' as const,
        })),
        ...discovery.map((term) => ({
          keyword: term.keyword,
          asset_count: term.count,
          reason: 'discovery' as const,
        })),
      ],
    };
  }
  /**
   * 目录检索，`store.tx` 包住整个查询以保证可见集合与游标校验同源。
   *
   * 分页基于偏移量而非稳定键：游标里只有 `fingerprint`、`offset` 与 15 分钟后的
   * `expires`，`fingerprint` 覆盖归一化后的查询参数（`cursor` 置空）、主体 id、
   * groups 与 bindings 的摘要以及 `store.revision()`。因此期间内容或授权变化会让
   * 旧游标失效（抛 400/`CURSOR_EXPIRED`），而不是静默翻到错位的数据。
   */
  search(p: Principal | null, input: CatalogSearchQuery) {
    return this.context.store.tx(() => this.searchSnapshot(p, input));
  }
  /**
   * 检索实现细节，必须在 {@link CatalogService.search} 的事务内调用。
   *
   * 打分：slug 精确 100 / 前缀 40 / 包含 25，标签命中 20，描述命中 10，语言与框架
   * 提示词每个 +2。中文多词查询须覆盖至少两词且不少于半数，完整 slug 命中可直接入选。
   * `limit` 缺省 20；`counts` 在 `category` 过滤之前统计，`total` 是过滤之后的总数，
   * 两者不能互推。游标过期或与当前参数不匹配时报 400/`CURSOR_EXPIRED`。
   */
  private async searchSnapshot(p: Principal | null, input: CatalogSearchQuery) {
    const q = { ...input, q: input.q ?? '', limit: input.limit ?? 20 };
    const query = q.q.normalize('NFKC').toLowerCase();
    const words = searchTerms(query);
    const minimumMatches = Math.min(
      words.length,
      han.test(query) ? Math.max(2, Math.ceil(words.length / 2)) : 1,
    );
    let results: CatalogMatch[] = [];
    for (const row of await this.visibleCatalog(p)) {
      const { asset: a, version: v, release: r, tags, normalizedTags, description: desc } = row;
      if (q.kind && a.kind !== q.kind) continue;
      if (q.scenario_id && !row.scenarioIds.has(q.scenario_id)) continue;
      let score = 0;
      let matched = 0;
      const reasons: string[] = [];
      for (const w of words) {
        const previousScore = score;
        if (a.slug === w) {
          score += 100;
          reasons.push('名称精确匹配');
        } else if (a.slug.startsWith(w)) {
          score += 40;
          reasons.push('名称前缀匹配');
        } else if (a.slug.includes(w)) {
          score += 25;
          reasons.push('名称匹配');
        }
        if (normalizedTags.some((t: string) => t.includes(w))) {
          score += 20;
          reasons.push('适用条件或场景匹配');
        }
        if (desc.includes(w)) {
          score += 10;
          reasons.push('描述匹配');
        }
        if (score > previousScore) matched++;
      }
      if (matched < minimumMatches && !words.includes(a.slug)) continue;
      for (const hint of [...(q.languages ?? []), ...(q.frameworks ?? [])])
        if (tags.some((t: string) => t.toLowerCase().includes(hint.toLowerCase()))) score += 2;
      results.push({
        asset: a,
        version: v,
        release: r,
        score,
        match_reasons: [...new Set(reasons)],
      });
    }
    const counts = {
      all: results.length,
      general: results.filter((x) => x.release.category === 'general').length,
      scenario: results.filter((x) => x.release.category === 'scenario').length,
      uncategorized: results.filter((x) => x.release.category === 'uncategorized').length,
    };
    if (q.category) results = results.filter((r) => r.release.category === q.category);
    if (words.length || q.languages?.length || q.frameworks?.length)
      results.sort(
        (a, b) =>
          b.score - a.score ||
          b.release.published_at.localeCompare(a.release.published_at) ||
          a.asset.id.localeCompare(b.asset.id),
      );
    const fingerprint = digest(
      canonical({
        ...q,
        cursor: null,
        principal: p?.id ?? null,
        auth: p ? sha256(canonical({ groups: p.groups, bindings: p.bindings })) : null,
        catalog_revision: await this.context.store.revision(),
      }),
    );
    let offset = 0;
    if (q.cursor) {
      const value = this.cursors.decode(q.cursor);
      if (!value || value.fingerprint !== fingerprint || value.expires <= Date.now())
        fail(400, 'CURSOR_EXPIRED', '分页条件已变化，请重新查询');
      offset = value.offset;
    }
    const next_cursor =
      offset + q.limit < results.length
        ? this.cursors.encode({
            fingerprint,
            offset: offset + q.limit,
            expires: Date.now() + 15 * 60000,
          })
        : null;

    return {
      items: await Promise.all(
        results.slice(offset, offset + q.limit).map(async (row) => ({
          ...(await this.describeAsset(row.asset, row.version, row.release, p)),
          score: row.score,
          match_reasons: row.match_reasons,
        })),
      ),
      total: results.length,
      counts,
      next_cursor,
    };
  }
  /**
   * 详情先用 id 或 slug 解析（{@link AssetAccessService.getAsset}），再做可读性校验，
   * 所以不可见与不存在对外都是 404，不泄露资源是否存在。没有当前发布的资源同样 404。
   * 结果与搜索结果条目同形，但不带 `score`/`match_reasons`。
   */
  async getDetail(p: Principal | null, id: string) {
    const { asset, version, release } = await this.access.requirePublishedAsset(p, id);
    return await this.describeAsset(asset, version, release, p);
  }

  /**
   * 版本历史只保留当前主体可读的版本，其余静默丢弃而不是报错，避免用“缺失条目”
   * 反推不可见版本；资源本身不可见时仍先由 `requirePublishedAsset` 抛 404。
   * 条目里的 `release_id` 取该版本最新的发布记录。
   */
  async listHistory(p: Principal | null, id: string) {
    const a = await this.access.getAsset(id);
    await this.access.requirePublishedAsset(p, id);
    return await Promise.all(
      (
        await filterAsync(
          await this.context.store.where('versions', 'asset_id', a.id),
          async (v) => await this.access.canRead(p, a, v),
        )
      ).map(async (v) => ({
        version_id: v.id,
        version_label: v.version_label,
        content_digest: v.content_digest,
        created_at: v.created_at,
        release_id: (await this.access.latestReleaseForVersion(v)).id,
      })),
    );
  }
}

interface CatalogEntry {
  asset: AssetRecord;
  version: VersionRecord;
  release: ReleaseRecord;
  resolved: ReleaseRecord;
  scenarioIds: Set<string>;
  tags: string[];
  normalizedTags: string[];
  description: string;
}
interface CatalogMatch {
  asset: AssetRecord;
  version: VersionRecord;
  release: ReleaseRecord;
  score: number;
  match_reasons: string[];
}
