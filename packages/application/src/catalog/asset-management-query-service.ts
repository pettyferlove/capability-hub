import type { Principal } from '@capability-hub/domain/identity';
import { fail, notFound } from '@capability-hub/domain/errors';
import { has } from '@capability-hub/domain/rbac';
import type { ApplicationContext } from '../shared/application-context.js';
import type { AssetAccessService } from './asset-access-service.js';
import { toVersionSnapshot } from './catalog-mapper.js';
import type { KeywordOptionsQuery } from './queries.js';

/**
 * 管理侧只读查询：可见面以 `asset:maintain` 与 `asset:lifecycle` 为准，和目录可见性
 * （受众 ∩ 发布状态）相互独立；任一权限通过就能看到资源，但能看到的字段不同。
 */
export class AssetManagementQueryService {
  constructor(
    private readonly context: ApplicationContext,
    private readonly access: AssetAccessService,
  ) {}

  /**
   * 资源管理列表，无分页：一次返回当前主体可见的全部资源，适合管理台全量渲染。
   *
   * 只在 `asset:maintain` 通过时才查询 intakes/requests，因此仅有 `asset:lifecycle`
   * 的主体拿到的是空的 `latest_intake`/`pending_requests`，候选数据不外泄；
   * `latest_intake.state` 在 intake 已 ready 时改用对应请求的状态，反映送审进展。
   */
  async list(principal: Principal) {
    return this.context.store.tx(async () =>
      Promise.all(
        (await this.context.store.all('assets'))
          .filter(
            (asset) =>
              this.access.canMaintain(principal, asset) ||
              has(principal, 'asset:lifecycle', this.access.assetContext(asset)),
          )
          .map(async (asset) => {
            const release = await this.context.store.get('releases', asset.current_release_id);
            const version = release
              ? await this.context.store.get('versions', release.version_id)
              : null;
            const canSubmit = this.access.canMaintain(principal, asset);
            const intakes = canSubmit
              ? await this.context.store.where('intakes', 'asset_id', asset.id)
              : [];
            const latest = intakes.sort(
              (a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id),
            )[0];
            const requests = canSubmit
              ? await this.context.store.where('requests', 'asset_id', asset.id)
              : [];
            const latestRequest = requests
              .filter((r) => r.source_intake_id === latest?.id)
              .sort(
                (a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id),
              )[0];
            const pending = await Promise.all(
              requests
                .filter((r) => r.state === 'pending')
                .map(async (r) => ({
                  id: r.id,
                  version_label: (await this.context.store.get('versions', r.version_id))!
                    .version_label,
                })),
            );
            return {
              id: asset.id,
              slug: asset.slug,
              kind: asset.kind,
              requires_api_key: asset.requires_api_key === true,
              owner_group_id: asset.owner_group_id,
              source_id: asset.source_id,
              source_kind: (await this.context.store.get('sources', asset.source_id))!.kind,
              lifecycle: asset.lifecycle,
              can_submit: this.access.canMaintain(principal, asset),
              can_delete: await this.access.canDelete(principal, asset),
              can_lifecycle: has(principal, 'asset:lifecycle', this.access.assetContext(asset)),
              can_view_catalog: await this.access.canViewCatalog(principal, asset),
              current_release: release ?? null,
              current_version: version
                ? { version_label: version.version_label, content_digest: version.content_digest }
                : null,
              latest_intake: latest
                ? {
                    id: latest.id,
                    version_label: latest.version_label,
                    state:
                      latest.state === 'ready'
                        ? (latestRequest?.state ?? latest.state)
                        : latest.state,
                  }
                : null,
              pending_requests: pending,
              current_release_id: asset.current_release_id,
              revision: asset.revision,
            };
          }),
      ),
    );
  }
  /**
   * 发布表单的关键词联想，在单个事务内聚合多个来源。
   *
   * 维护者看到 intake、未退休 binding、request、release、version（元数据里的
   * `applies_to.keywords`）的全部关键词；非维护者只回填其可读发布的
   * `applies_to.keywords`——未发布内容的关键词属于维护数据，不能借此探测。
   * 结果按完全匹配优先、覆盖资源数降序、中文排序，截断到 `query.limit`。
   */
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
  /**
   * 列出资源全部版本及其发布状态，`assetId` 既可以是 id 也可以是 slug。
   *
   * 要求 `asset:maintain` 或 `asset:lifecycle`，否则抛 403/`FORBIDDEN`；
   * 读取成功前写审计 `asset.management_versions`，所以每次调用都留痕。
   * `published` 表示该版本仍有发布记录，与 `availability` 不是同一维度。
   */
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
  /**
   * 候选版本详情：版本不存在抛 404；否则要求资源维护权限，或能审该版本对应的
   * 发布申请，否则 {@link AssetAccessService.requireCandidateAccess} 抛 403/`FORBIDDEN`
   * 并写审计 `content.management_read`。返回内容用
   * {@link toVersionSnapshot} 投影，不含对象存储定位；`scans` 为扫描记录原样返回。
   */
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
