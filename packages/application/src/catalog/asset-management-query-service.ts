import type { Principal } from '@capability-hub/domain/identity';
import type { IntakeRecord } from '@capability-hub/domain/models';
import { fail, notFound } from '@capability-hub/domain/errors';
import { has } from '@capability-hub/domain/rbac';
import type { ApplicationContext } from '../shared/application-context.js';
import { resolveAuditActor } from '../audit/audit-snapshot.js';
import type { AssetAccessService } from './asset-access-service.js';
import { toVersionSnapshot } from './catalog-mapper.js';
import type { KeywordOptionsQuery, ManagementAssetListQuery } from './queries.js';

/**
 * 管理侧只读查询：可见面以 `asset:maintain` 与 `asset:lifecycle` 为准，和目录可见性
 * （受众 ∩ 发布状态）相互独立；任一权限通过就能看到资源，但能看到的字段不同。
 */
export class AssetManagementQueryService {
  constructor(
    private readonly context: ApplicationContext,
    private readonly access: AssetAccessService,
  ) {}

  private async intakeContributor(intake: IntakeRecord | undefined) {
    while (intake?.rescan_of) intake = await this.context.store.get('intakes', intake.rescan_of);
    if (!intake) return null;
    const source = await this.context.store.get('sources', intake.source_id);
    if (!source) return null;
    const job = await this.context.store.get('jobs', intake.source_sync_job_id);
    const actorId =
      job?.kind === 'source_sync' && job.input.scheduled ? 'system' : intake.requested_by;
    return {
      source_kind: source.kind,
      actor: await resolveAuditActor(this.context.store, actorId),
    };
  }

  /** 先按权限收敛，再筛选、按名称排序并分页；删除末页记录后返回仍有效的最后一页。 */
  async list(principal: Principal, input: ManagementAssetListQuery = {}) {
    const query = { q: '', state: 'all', page: 1, page_size: 10, ...input };
    const words = query.q.normalize('NFKC').toLowerCase().split(/\s+/).filter(Boolean);
    const rows = (await this.options(principal))
      .filter((asset) => {
        const text = `${asset.slug} ${asset.kind}`.normalize('NFKC').toLowerCase();
        return (
          words.every((word) => text.includes(word)) &&
          (query.state === 'all' ||
            (query.state === 'pending'
              ? asset.pending_requests.length > 0
              : asset.lifecycle === query.state))
        );
      })
      .sort((a, b) => a.slug.localeCompare(b.slug, 'en') || a.id.localeCompare(b.id));
    const page = Math.min(query.page, Math.max(1, Math.ceil(rows.length / query.page_size)));
    return {
      items: rows.slice((page - 1) * query.page_size, page * query.page_size),
      total: rows.length,
      page,
      page_size: query.page_size,
    };
  }
  /**
   * 上传与授权表单的完整资源选项，不受维护列表的筛选和页码限制。
   *
   * 仅有 `asset:lifecycle` 的主体可见贡献者，但 `latest_intake`/`pending_requests`
   * 仍为空，不披露候选详情；
   * `latest_intake.state` 在 intake 已 ready 时改用对应请求的状态，反映送审进展。
   */
  async options(principal: Principal) {
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
            const intakes = await this.context.store.where('intakes', 'asset_id', asset.id);
            intakes.sort(
              (a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id),
            );
            const latest = canSubmit ? intakes[0] : undefined;
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
            const deleteBlockReason = await this.access.deleteBlockReason(principal, asset);
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
              can_delete: deleteBlockReason === null,
              delete_block_reason: deleteBlockReason,
              can_lifecycle: has(principal, 'asset:lifecycle', this.access.assetContext(asset)),
              can_view_catalog: await this.access.canViewCatalog(principal, asset),
              current_release: release ?? null,
              current_version: version
                ? { version_label: version.version_label, content_digest: version.content_digest }
                : null,
              latest_contributor: await this.intakeContributor(intakes.find((r) => !r.rescan_of)),
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
    return this.context.store.tx(async () => {
      const asset = await this.access.getAsset(assetId);
      if (
        !this.access.canMaintain(principal, asset) &&
        !has(principal, 'asset:lifecycle', this.access.assetContext(asset))
      )
        fail(403, 'FORBIDDEN', '无资源管理权限');
      await this.context.store.audit(principal.id, 'asset.management_versions', asset.id);
      return Promise.all(
        (await this.context.store.where('versions', 'asset_id', asset.id)).map(async (version) => {
          const deleteBlockReason = await this.access.deleteBlockReason(principal, asset, version);
          return {
            version_id: version.id,
            version_label: version.version_label,
            availability: version.availability,
            content_digest: version.content_digest,
            published: !!(await this.access.latestReleaseForVersion(version)),
            can_delete: deleteBlockReason === null,
            delete_block_reason: deleteBlockReason,
            contributor: await this.intakeContributor(
              await this.context.store.get('intakes', version.intake_id),
            ),
          };
        }),
      );
    });
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
