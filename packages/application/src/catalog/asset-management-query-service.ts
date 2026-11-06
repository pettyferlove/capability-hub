import type { Principal } from '@capability-hub/domain/identity';
import type { IntakeRecord } from '@capability-hub/domain/models';
import { fail, notFound } from '@capability-hub/domain/errors';
import { has } from '@capability-hub/domain/rbac';
import type { ApplicationContext } from '../shared/application-context.js';
import { resolveAuditActor } from '../audit/audit-snapshot.js';
import type { AssetAccessService } from './asset-access-service.js';
import { toVersionSnapshot } from './catalog-mapper.js';
import type { KeywordOptionsQuery, ManagementAssetListQuery } from './queries.js';
import type { PublicationQueryService } from '../publication/publication-query-service.js';

const activityLabels: Record<string, string> = {
  'publication.submitted': '提交审核',
  'publication.nominated': '提名为通用',
  'publication.rejected': '审核退回',
  'publication.cancelled': '撤回申请',
  'publication.stale': '发布申请失效',
  'publication.approved': '审核通过并发布',
  'version.deleted': '删除未发布版本',
  'version.revoked': '撤销版本',
  'asset.usage_updated': '更新使用要求',
  'asset.mcp_key_updated': '更新共享密钥',
  'asset.source_migrated': '迁移来源',
  'asset.active': '恢复活动',
  'asset.deprecated': '弃用资产',
  'asset.blocked': '封禁资产',
};

/**
 * 管理侧只读查询：可见面以 `asset:maintain` 与 `asset:lifecycle` 为准，和目录可见性
 * （受众 ∩ 发布状态）相互独立；任一权限通过就能看到资源，但能看到的字段不同。
 */
export class AssetManagementQueryService {
  constructor(
    private readonly context: ApplicationContext,
    private readonly access: AssetAccessService,
    private readonly publicationQueries: PublicationQueryService,
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

  /** 先按权限和状态收敛，再排序分页；删除末页记录后返回仍有效的最后一页。 */
  async list(principal: Principal, input: ManagementAssetListQuery = {}) {
    const query = {
      q: '',
      state: 'all',
      sort: 'recent_activity',
      page: 1,
      page_size: 10,
      ...input,
    };
    const words = query.q.normalize('NFKC').toLowerCase().split(/\s+/).filter(Boolean);
    const rows = (await this.options(principal))
      .filter((asset) => {
        const text = `${asset.slug} ${asset.kind}`.normalize('NFKC').toLowerCase();
        return (
          words.every((word) => text.includes(word)) &&
          (query.state === 'all' ||
            (query.state === 'needs_attention'
              ? asset.needs_attention
              : query.state === 'processing'
                ? ['received', 'fetching', 'scanning'].includes(asset.latest_intake?.state ?? '')
                : query.state === 'pending'
                  ? asset.pending_requests.length > 0
                  : asset.lifecycle === query.state))
        );
      })
      .sort(
        (a, b) =>
          (query.sort === 'recent_activity'
            ? b.latest_activity.occurred_at.localeCompare(a.latest_activity.occurred_at)
            : 0) ||
          a.slug.localeCompare(b.slug, 'en') ||
          a.id.localeCompare(b.id),
      );
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
   * `latest_intake.state` 在 intake 已 ready 时改用对应请求的状态；
   * 无变化的 Git 同步沿用同一候选的最新请求。
   */
  async options(principal: Principal) {
    return this.context.store.tx(async () => {
      const actions = Object.keys(activityLabels);
      const events = await this.context.store.summarizeAssetAuditActivity(actions);
      const activities = new Map<string, typeof events>();
      for (const event of events.sort(
        (a, b) =>
          a.occurred_at.localeCompare(b.occurred_at) ||
          actions.indexOf(a.action) - actions.indexOf(b.action),
      )) {
        const entries = activities.get(event.asset_id) ?? [];
        entries.push(event);
        activities.set(event.asset_id, entries);
      }
      return Promise.all(
        (await this.context.store.all('assets'))
          .filter(
            (asset) =>
              this.access.canMaintain(principal, asset) ||
              has(principal, 'asset:lifecycle', this.access.assetContext(asset)),
          )
          .map(async (asset) => {
            const source = (await this.context.store.get('sources', asset.source_id))!;
            const release = await this.context.store.get('releases', asset.current_release_id);
            const version = release
              ? await this.context.store.get('versions', release.version_id)
              : null;
            const canMaintain = this.access.canMaintain(principal, asset);
            const intakes = await this.context.store.where('intakes', 'asset_id', asset.id);
            intakes.sort(
              (a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id),
            );
            const latest = canMaintain ? intakes[0] : undefined;
            const requests = canMaintain
              ? await this.context.store.where('requests', 'asset_id', asset.id)
              : [];
            const candidateIntakeIds = new Set<string>();
            let latestActivity = { occurred_at: asset.created_at, label: '新建资产' };
            const updateLatestActivity = (occurredAt: string, label: string) => {
              if (occurredAt >= latestActivity.occurred_at)
                latestActivity = { occurred_at: occurredAt, label };
            };
            if (canMaintain) {
              const chronological = [...intakes].reverse();
              for (const [index, intake] of chronological.entries()) {
                const previous = chronological[index - 1];
                // 相同内容、规则与来源配置的成功 Git 轮询不构成新的维护动态。
                const unchanged =
                  intake.binding_id &&
                  !intake.rescan_of &&
                  intake.state === 'ready' &&
                  previous?.state === 'ready' &&
                  intake.source_id === previous.source_id &&
                  intake.binding_id === previous.binding_id &&
                  intake.content_digest === previous.content_digest &&
                  intake.source_revision === previous.source_revision &&
                  intake.processing_ruleset === previous.processing_ruleset;
                if (!unchanged) candidateIntakeIds.clear();
                candidateIntakeIds.add(intake.id);
                if (unchanged) continue;
                updateLatestActivity(
                  intake.created_at,
                  intake.rescan_of ? '重新校验' : '接收新版本',
                );
                if (intake.finished_at)
                  updateLatestActivity(
                    intake.finished_at,
                    intake.state === 'ready'
                      ? '校验通过'
                      : intake.state === 'failed'
                        ? '处理失败'
                        : '处理取消',
                  );
              }
              for (const request of requests) {
                updateLatestActivity(request.created_at, '提交审核');
                if (request.decided_at)
                  updateLatestActivity(
                    request.decided_at,
                    request.state === 'approved' ? '审核通过并发布' : '审核退回',
                  );
              }
            }
            if (release) updateLatestActivity(release.published_at, '审核通过并发布');
            for (const event of activities.get(asset.id) ?? [])
              if (
                canMaintain ||
                event.action.startsWith('asset.') ||
                event.action === 'version.revoked'
              )
                updateLatestActivity(event.occurred_at, activityLabels[event.action]);
            const latestRequest = requests
              .filter((request) => candidateIntakeIds.has(request.source_intake_id))
              .sort(
                (a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id),
              )[0];
            const latestState =
              latest?.state === 'ready' ? (latestRequest?.state ?? latest.state) : latest?.state;
            const pending = await Promise.all(
              requests
                .filter((request) => request.state === 'pending')
                .map(async (request) => {
                  const review = await this.publicationQueries.getReview(principal, request.id);
                  return {
                    id: request.id,
                    version_label: review.candidate.version_label,
                    context_valid: review.context_valid,
                  };
                }),
            );
            const needsSubmission =
              ['ready', 'rejected', 'stale'].includes(latestState ?? '') ||
              pending.some((request) => request.id === latestRequest?.id && !request.context_valid);
            const latestVersion = await this.context.store.get('versions', latest?.version_id);
            const alreadyPublished =
              latest?.state === 'ready' &&
              release?.version_id === latest.version_id &&
              !latestRequest;
            const needsAttention =
              canMaintain &&
              asset.lifecycle === 'active' &&
              source.state !== 'blocked' &&
              !source.distribution_revoked_at &&
              latest?.source_id === asset.source_id &&
              !alreadyPublished &&
              (latestState === 'failed'
                ? source.kind === 'upload' ||
                  has(principal, 'source:manage', this.access.assetContext(asset))
                : needsSubmission &&
                  latestVersion?.availability !== 'revoked' &&
                  has(principal, 'source:share', this.access.assetContext(asset)) &&
                  !requests.some(
                    (request) =>
                      request.version_id === latest?.version_id &&
                      pending.some((entry) => entry.id === request.id && entry.context_valid),
                  ));
            const deleteBlockReason = await this.access.deleteBlockReason(principal, asset);
            return {
              id: asset.id,
              slug: asset.slug,
              kind: asset.kind,
              requires_api_key: asset.requires_api_key === true,
              owner_group_id: asset.owner_group_id,
              source_id: asset.source_id,
              source_kind: source.kind,
              lifecycle: asset.lifecycle,
              can_submit: canMaintain,
              can_delete: deleteBlockReason === null,
              delete_block_reason: deleteBlockReason,
              can_lifecycle: has(principal, 'asset:lifecycle', this.access.assetContext(asset)),
              can_view_catalog: await this.access.canViewCatalog(principal, asset),
              current_release: release ?? null,
              current_version: version
                ? { version_label: version.version_label, content_digest: version.content_digest }
                : null,
              latest_contributor: await this.intakeContributor(intakes.find((r) => !r.rescan_of)),
              latest_activity: latestActivity,
              needs_attention: needsAttention,
              latest_intake: latest
                ? {
                    id: latest.id,
                    version_label: latest.version_label,
                    state: latestState!,
                  }
                : null,
              pending_requests: pending,
              current_release_id: asset.current_release_id,
              revision: asset.revision,
            };
          }),
      );
    });
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
