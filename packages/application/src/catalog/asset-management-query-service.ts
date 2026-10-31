import type { Principal } from '@capability-hub/domain/identity';
import { fail, notFound } from '@capability-hub/domain/errors';
import { has } from '@capability-hub/domain/rbac';
import type { ApplicationContext } from '../shared/application-context.js';
import type { AssetAccessService } from './asset-access-service.js';
import { toVersionSnapshot } from './catalog-mapper.js';
import type { KeywordOptionsQuery } from './queries.js';

export class AssetManagementQueryService {
  constructor(
    private readonly context: ApplicationContext,
    private readonly access: AssetAccessService,
  ) {}

  async list(principal: Principal) {
    return Promise.all(
      (await this.context.store.all('assets'))
        .filter(
          (asset) =>
            this.access.canMaintain(principal, asset) ||
            has(principal, 'asset:lifecycle', this.access.assetContext(asset)),
        )
        .map(async (asset) => ({
          id: asset.id,
          slug: asset.slug,
          kind: asset.kind,
          owner_group_id: asset.owner_group_id,
          source_id: asset.source_id,
          source_kind: (await this.context.store.get('sources', asset.source_id))!.kind,
          lifecycle: asset.lifecycle,
          can_submit: this.access.canMaintain(principal, asset),
          can_lifecycle: has(principal, 'asset:lifecycle', this.access.assetContext(asset)),
          can_view_catalog: await this.access.canViewCatalog(principal, asset),
          current_release:
            (await this.context.store.get('releases', asset.current_release_id)) ?? null,
          current_release_id: asset.current_release_id,
          revision: asset.revision,
        })),
    );
  }
  async keywordOptions(principal: Principal, query: KeywordOptionsQuery) {
    return this.context.store.tx(async () => {
      const terms = new Map<string, { keyword: string; assets: Set<string> }>();
      const search = query.q.normalize('NFKC').toLowerCase();
      const add = (assetId: string, keywords: string[] = []) => {
        for (const value of keywords) {
          const keyword = value.normalize('NFKC').trim().replace(/\s+/g, ' ');
          const key = keyword.toLowerCase();
          if (!key || !key.includes(search)) continue;
          const term = terms.get(key) ?? { keyword, assets: new Set<string>() };
          term.assets.add(assetId);
          terms.set(key, term);
        }
      };
      for (const asset of await this.context.store.all('assets')) {
        // 未发布内容的关键词也属于维护数据，不能通过联想查询泄露给其他用户。
        if (!this.access.canMaintain(principal, asset)) {
          if (await this.access.canViewCatalog(principal, asset)) {
            const release = await this.context.store.get('releases', asset.current_release_id);
            add(asset.id, release?.applies_to.keywords);
          }
          continue;
        }
        for (const intake of await this.context.store.where('intakes', 'asset_id', asset.id))
          add(asset.id, intake.keywords);
        for (const binding of await this.context.store.where('bindings', 'asset_id', asset.id))
          if (!binding.retired_at) add(asset.id, binding.applies_to.keywords);
        for (const request of await this.context.store.where('requests', 'asset_id', asset.id))
          add(asset.id, request.applies_to.keywords);
        for (const release of await this.context.store.where('releases', 'asset_id', asset.id))
          add(asset.id, release.applies_to.keywords);
        for (const version of await this.context.store.where('versions', 'asset_id', asset.id))
          add(asset.id, version.metadata.applies_to?.keywords);
      }
      return {
        items: [...terms.values()]
          .sort(
            (a, b) =>
              Number(b.keyword.toLowerCase() === search) -
                Number(a.keyword.toLowerCase() === search) ||
              b.assets.size - a.assets.size ||
              a.keyword.localeCompare(b.keyword, 'zh-CN'),
          )
          .slice(0, query.limit)
          .map((term) => term.keyword),
      };
    });
  }
  async versions(principal: Principal, assetId: string) {
    const asset = await this.access.getAsset(assetId);
    if (
      !this.access.canMaintain(principal, asset) &&
      !has(principal, 'asset:lifecycle', this.access.assetContext(asset))
    )
      fail(403, 'FORBIDDEN', '无资源管理权限');
    await this.context.store.audit(principal.id, 'asset.management_versions', asset.id);
    return Promise.all(
      (await this.context.store.where('versions', 'asset_id', asset.id)).map(async (version) => ({
        version_id: version.id,
        version_label: version.version_label,
        availability: version.availability,
        content_digest: version.content_digest,
        published: !!(await this.access.latestReleaseForVersion(version)),
      })),
    );
  }
  async versionDetails(principal: Principal, versionId: string) {
    const version = await this.context.store.get('versions', versionId);
    if (!version) notFound();
    await this.access.requireCandidateAccess(principal, version);
    return {
      version: toVersionSnapshot(version),
      scans: await this.context.store.where('scans', 'version_id', version.id),
    };
  }
}
