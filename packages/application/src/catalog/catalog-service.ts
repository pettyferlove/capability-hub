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
import type { AssetCommunityService } from './asset-community-service.js';

/** 只检索当前可分发的发布；缓存不保存用户身份或授权结果。 */
export class CatalogService {
  private catalogCache: { revision: string; rows: CatalogEntry[] } | undefined;
  constructor(
    private readonly context: ApplicationContext,
    private readonly access: AssetAccessService,
    private readonly community: AssetCommunityService,
    private readonly cursors: CatalogCursorCodec,
  ) {}
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
      installation_options: version.metadata.installation_options ?? [],
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
  private async getCatalog() {
    const revision = await this.context.store.revision();
    if (this.catalogCache?.revision === revision) return this.catalogCache.rows;
    const rows: CatalogEntry[] = [];
    const scenarios = await this.context.store.all('scenarios');
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
      const labels = r.scenario_ids.map(
        (id: string) => scenarios.find((s) => s.id === id)?.name ?? '',
      );
      rows.push({
        asset: a,
        version: v,
        release: r,
        resolved,
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
  private async visibleCatalog(p: Principal | null) {
    return await filterAsync(
      await this.getCatalog(),
      async (row) =>
        (!p || p.active) &&
        (await this.access.matchesAudience(p, row.release)) &&
        (await this.access.matchesAudience(p, row.resolved)),
    );
  }
  listScenarios(p: Principal | null) {
    return this.context.store.tx(() => this.listScenariosSnapshot(p));
  }
  private async listScenariosSnapshot(p: Principal | null) {
    const visibleIds = new Set(
      (await this.visibleCatalog(p)).flatMap((row) => row.release.scenario_ids),
    );
    return (await this.context.store.all('scenarios')).filter(
      (s) => s.active && (p || visibleIds.has(s.id)),
    );
  }
  suggestKeywords(p: Principal | null, input: KeywordSuggestionsQuery, random = Math.random) {
    return this.context.store.tx(() => this.suggestKeywordsSnapshot(p, input, random));
  }
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
      if (query.scenario_id && !row.release.scenario_ids.includes(query.scenario_id)) continue;
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
  search(p: Principal | null, input: CatalogSearchQuery) {
    return this.context.store.tx(() => this.searchSnapshot(p, input));
  }
  private async searchSnapshot(p: Principal | null, input: CatalogSearchQuery) {
    const q = { ...input, q: input.q ?? '', limit: input.limit ?? 20 };
    const query = q.q.normalize('NFKC').toLowerCase();
    const words = query.split(/\s+/).filter(Boolean);
    let results: CatalogMatch[] = [];
    for (const row of await this.visibleCatalog(p)) {
      const { asset: a, version: v, release: r, tags, normalizedTags, description: desc } = row;
      if (q.kind && a.kind !== q.kind) continue;
      if (q.scenario_id && !r.scenario_ids.includes(q.scenario_id)) continue;
      let score = 0;
      const reasons: string[] = [];
      for (const w of words) {
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
      }
      if (words.length && !score) continue;
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
  async getDetail(p: Principal | null, id: string) {
    const { asset, version, release } = await this.access.requirePublishedAsset(p, id);
    return await this.describeAsset(asset, version, release, p);
  }

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
