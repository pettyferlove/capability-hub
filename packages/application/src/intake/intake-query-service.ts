import { filterAsync, someAsync } from '@capability-hub/domain/async';
import type { Policy } from '@capability-hub/domain/policy';
import type { Principal } from '@capability-hub/domain/identity';
import type { IntakeListQuery, IntakeStatus } from './commands.js';
import type { IntakeRecord } from '@capability-hub/domain/models';
import { contentScanRuleset } from '@capability-hub/domain/content';
import { fail, notFound } from '@capability-hub/domain/errors';
import { toVersionSnapshot } from '../catalog/catalog-mapper.js';
import { toIntakeDetails } from './intake-mapper.js';
import { createVersionPlan } from './version-plan.js';
import type { ApplicationContext } from '../shared/application-context.js';
import type { AssetAccessService } from '../catalog/asset-access-service.js';

export class IntakeQueryService {
  constructor(
    private readonly context: ApplicationContext,
    private readonly assets: AssetAccessService,
  ) {}
  async versionPlan(principal: Principal, assetId: string) {
    const asset = await this.assets.getAsset(assetId);
    this.assets.requireMaintenance(principal, asset);
    const release = await this.context.store.get('releases', asset.current_release_id ?? '');
    const current = release && (await this.context.store.get('versions', release.version_id));
    const versions = await this.context.store.where('versions', 'asset_id', asset.id);
    const pending = (await this.context.store.where('intakes', 'asset_id', asset.id)).filter(
      (intake) => !['failed', 'cancelled'].includes(intake.state),
    );
    return createVersionPlan(current?.version_label ?? null, [
      ...versions.map((version) => version.version_label),
      ...pending.map((intake) => intake.version_label),
    ]);
  }
  async list(principal: Principal, input: IntakeListQuery) {
    const query = { page: 1, page_size: 5, q: '', state: 'all', ...input };
    const permitted = await filterAsync(
      await this.context.store.all('intakes'),
      async (r) =>
        r.requested_by === principal.id ||
        this.assets.canMaintain(principal, await this.assets.getAsset(r.asset_id)),
    );
    const processing = (r: IntakeRecord) => ['received', 'fetching', 'scanning'].includes(r.state);
    const latestPublications = new Map<string, IntakeStatus>();
    for (const request of (await this.context.store.all('requests')).sort(
      (a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id),
    )) {
      if (!latestPublications.has(request.source_intake_id))
        latestPublications.set(request.source_intake_id, request.state);
    }
    const rows = (
      await Promise.all(
        permitted.map(async (r) => {
          const asset = await this.assets.getAsset(r.asset_id);
          return {
            id: r.id,
            asset_id: asset.id,
            asset_slug: asset.slug,
            kind: asset.kind,
            version_label: r.version_label,
            created_at: r.created_at,
            status:
              asset.lifecycle !== 'active'
                ? asset.lifecycle
                : r.state === 'failed' || r.state === 'cancelled'
                  ? r.state
                  : r.state === 'ready'
                    ? (latestPublications.get(r.id) ?? 'ready')
                    : 'processing',
            phase: r.phase,
            source_kind:
              (await this.context.store.get('sources', r.source_id))?.kind === 'git'
                ? 'git'
                : 'upload',
            content_digest: r.content_digest ?? null,
            file_count: null,
            error_message: r.error_message ?? r.error_code ?? null,
          };
        }),
      )
    ).filter((r) =>
      [r.asset_slug, r.version_label, r.kind]
        .join(' ')
        .toLowerCase()
        .includes(query.q.toLowerCase()),
    );
    const counts: Record<string, number> = {};
    for (const row of rows) counts[row.status] = (counts[row.status] ?? 0) + 1;
    const filtered = rows
      .filter((r) => query.state === 'all' || r.status === query.state)
      .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id));
    const page = Math.min(query.page, Math.max(1, Math.ceil(filtered.length / query.page_size)));
    // 只为当前页读取版本快照，避免加载整个列表的内容清单。
    const records = new Map(permitted.map((r) => [r.id, r]));
    const items = await Promise.all(
      filtered.slice((page - 1) * query.page_size, page * query.page_size).map(async (row) => {
        const versionId = records.get(row.id)?.version_id;
        const version = versionId ? await this.context.store.get('versions', versionId) : null;
        return {
          ...row,
          content_digest: row.content_digest ?? version?.content_digest ?? null,
          file_count: version?.manifest.files.length ?? null,
        };
      }),
    );
    return {
      items,
      total: filtered.length,
      page,
      page_size: query.page_size,
      counts,
      processing_total: permitted.filter(processing).length,
    };
  }
  private async visibleIntake(principal: Principal, id: string) {
    const intake = await this.context.store.get('intakes', id);
    if (!intake) notFound();
    const asset = await this.assets.getAsset(intake.asset_id);
    const requests = (
      await this.context.store.where('requests', 'source_intake_id', intake.id)
    ).sort(
      (left, right) =>
        right.created_at.localeCompare(left.created_at) || right.id.localeCompare(left.id),
    );
    if (
      intake.requested_by !== principal.id &&
      !this.assets.canMaintain(principal, asset) &&
      !(await someAsync(
        requests,
        async (request) =>
          request.version_id === intake.version_id &&
          (await this.assets.canReview(principal, request)),
      ))
    )
      fail(403, 'FORBIDDEN', '无接收记录权限');
    return { intake, asset, requests };
  }
  async getProgress(principal: Principal, id: string) {
    const { intake } = await this.visibleIntake(principal, id);
    return {
      id: intake.id,
      state: intake.state,
      phase: intake.phase,
      progress: intake.progress.map(({ step, started_at }) => ({ step, started_at })),
      finished_at: intake.finished_at ?? null,
      error_code: intake.error_code ?? null,
      error_message: intake.error_message ?? null,
    };
  }
  async getDetail(principal: Principal, id: string) {
    const { intake, asset, requests } = await this.visibleIntake(principal, id);
    const [version, binding, release, scan] = await Promise.all([
      this.context.store.get('versions', intake.version_id),
      this.context.store.get('bindings', intake.binding_id),
      this.context.store.get('releases', asset.current_release_id),
      this.context.store.get('scans', intake.scan_run_id),
    ]);
    const currentVersion = release
      ? await this.context.store.get('versions', release.version_id)
      : null;
    const selectedPolicy = binding ?? release;
    const policy: Policy = selectedPolicy
      ? {
          category: selectedPolicy.category,
          scenario_ids: selectedPolicy.scenario_ids,
          distribution: selectedPolicy.distribution,
        }
      : {
          category: 'uncategorized',
          scenario_ids: [],
          distribution: { mode: 'approved_audience', audience: ['group:' + asset.owner_group_id] },
        };
    const hints = binding?.applies_to ?? release?.applies_to ?? version?.metadata.applies_to ?? {};
    return {
      ...toIntakeDetails(intake),
      asset_slug: asset.slug,
      current_release_id: release?.id ?? null,
      current_version: currentVersion
        ? {
            version_label: currentVersion.version_label,
            content_digest: currentVersion.content_digest,
          }
        : null,
      asset_lifecycle: asset.lifecycle,
      asset_lifecycle_reason: asset.deprecation_reason ?? '',
      can_view_catalog: await this.assets.canViewCatalog(principal, asset),
      retryable: !intake.binding_id && (intake.retryable ?? false),
      version: version ? toVersionSnapshot(version) : null,
      scan: scan ?? null,
      publication: requests[0] ?? null,
      proposed_policy: policy,
      proposed_applies_to: { ...hints, ...(intake.keywords ? { keywords: intake.keywords } : {}) },
      proposed_requires_api_key: intake.requires_api_key ?? asset.requires_api_key === true,
      ruleset_current: scan?.ruleset_version === contentScanRuleset,
    };
  }
}
