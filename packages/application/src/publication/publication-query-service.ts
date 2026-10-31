import type { Principal } from '@capability-hub/domain/identity';
import type { PublicationRequestRecord } from '@capability-hub/domain/models';
import { filterAsync } from '@capability-hub/domain/async';
import { contentScanRuleset } from '@capability-hub/domain/content';
import { fail, notFound } from '@capability-hub/domain/errors';
import type { ApplicationContext } from '../shared/application-context.js';
import type { AssetAccessService } from '../catalog/asset-access-service.js';

export class PublicationQueryService {
  constructor(
    private readonly context: ApplicationContext,
    private readonly assets: AssetAccessService,
  ) {}
  async listRequests(principal: Principal, state = 'pending') {
    return await Promise.all(
      (
        await filterAsync(
          await this.context.store.all('requests'),
          async (r) =>
            r.state === state &&
            ((await this.assets.canReview(principal, r)) ||
              this.assets.canMaintain(principal, await this.assets.getAsset(r.asset_id)) ||
              r.submitted_by === principal.id),
        )
      )
        .sort((a, b) => a.created_at.localeCompare(b.created_at))
        .map(async (r) => await this.describe(principal, r)),
    );
  }
  private async describe(principal: Principal, request: PublicationRequestRecord) {
    if (
      !(await this.assets.canReview(principal, request)) &&
      request.submitted_by !== principal.id &&
      !this.assets.canMaintain(principal, await this.assets.getAsset(request.asset_id))
    )
      fail(403, 'FORBIDDEN', '无审核权限');
    const a = await this.assets.getAsset(request.asset_id);
    const v = (await this.context.store.get('versions', request.version_id))!;
    const current = await this.context.store.get('releases', request.base_release_id ?? '');
    const previous = current ? await this.context.store.get('versions', current.version_id) : null;
    const source = await this.context.store.get('sources', request.policy_source_id);
    const scan = await this.context.store.get('scans', request.scan_run_id);
    const contextValid =
      a.current_release_id === request.base_release_id &&
      a.revision === request.asset_revision &&
      source?.revision === request.source_revision &&
      source?.state !== 'blocked' &&
      !source?.distribution_revoked_at &&
      a.lifecycle === 'active' &&
      v.availability !== 'revoked' &&
      scan?.state === 'passed' &&
      scan?.ruleset_version === contentScanRuleset;
    const oldFiles = previous?.manifest.files ?? [];
    return {
      ...request,
      visibility_label: await this.assets.formatVisibility(request.distribution),
      asset: { id: a.id, slug: a.slug, kind: a.kind, owner_group_id: a.owner_group_id },
      candidate: {
        id: v.id,
        version_label: v.version_label,
        content_digest: v.content_digest,
        manifest: v.manifest,
        metadata: v.metadata,
      },
      current: current
        ? {
            visibility_label: await this.assets.formatVisibility(current.distribution),
            release: current,
            version_label: previous?.version_label,
            manifest: previous?.manifest,
          }
        : null,
      scan: await this.context.store.get('scans', request.scan_run_id),
      submitter: (await this.context.store.get('users', request.submitted_by))?.display_name,
      context_valid: contextValid,
      can_decide:
        request.state === 'pending' &&
        request.submitted_by !== principal.id &&
        (!request.nomination || request.source_consent.actor_id !== principal.id) &&
        (await this.assets.canReview(principal, request)) &&
        contextValid,
      diff: v.manifest.files
        .map((f) => ({
          path: f.path,
          status: !oldFiles.some((o) => o.path === f.path)
            ? 'added'
            : oldFiles.some(
                  (o) =>
                    o.path === f.path && o.sha256 === f.sha256 && o.executable === f.executable,
                )
              ? 'unchanged'
              : 'modified',
          sha256: f.sha256,
          size: f.size,
        }))
        .concat(
          oldFiles
            .filter((f) => !v.manifest.files.some((n) => n.path === f.path))
            .map((f) => ({ ...f, status: 'removed' })),
        ),
    };
  }
  async getReview(principal: Principal, id: string) {
    const request = await this.context.store.get('requests', id);
    if (!request) notFound();
    return await this.describe(principal, request);
  }
}
