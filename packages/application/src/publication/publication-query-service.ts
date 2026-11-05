import type { Principal } from '@capability-hub/domain/identity';
import type { PublicationRequestRecord } from '@capability-hub/domain/models';
import { filterAsync } from '@capability-hub/domain/async';
import { contentScanRuleset } from '@capability-hub/domain/content';
import { fail, notFound } from '@capability-hub/domain/errors';
import { has } from '@capability-hub/domain/rbac';
import type { ApplicationContext } from '../shared/application-context.js';
import type { AssetAccessService } from '../catalog/asset-access-service.js';

/**
 * 审核队列与审核详情的只读投影：视图附带 `context_valid`、`can_decide` 与文件级 diff，
 * 让前端在点击批准前就能看到上下文是否已失效，减少必然失败的决策请求。
 */
export class PublicationQueryService {
  constructor(
    private readonly context: ApplicationContext,
    private readonly assets: AssetAccessService,
  ) {}
  /**
   * 列出指定状态的申请详情，只保留当前 principal 可审查、可维护或本人提交的条目，
   * 三者皆不满足的申请被静默过滤而不是报 403；按 `created_at` 升序返回整套审核视图。
   * 需要为每条记录逐项读取资产、版本与扫描，结果集随存储规模线性变慢，不分页。
   * @param state - 申请状态过滤，默认 `pending`（`approved`/`rejected`/`cancelled`/`stale`）。
   */
  async listRequests(principal: Principal, state = 'pending') {
    return this.context.store.tx(async () =>
      Promise.all(
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
      ),
    );
  }
  private async reviewContext(principal: Principal, request: PublicationRequestRecord) {
    const a = await this.assets.getAsset(request.asset_id);
    const v = (await this.context.store.get('versions', request.version_id))!;
    const source = await this.context.store.get('sources', request.policy_source_id);
    const scan = await this.context.store.get('scans', request.scan_run_id);
    const canReview = await this.assets.canReview(principal, request);
    const independent =
      canReview &&
      request.submitted_by !== principal.id &&
      (!request.nomination || request.source_consent.actor_id !== principal.id);
    const available =
      !!source &&
      source.state !== 'blocked' &&
      !source.distribution_revoked_at &&
      a.lifecycle !== 'blocked' &&
      v.availability !== 'revoked';
    const contextValid =
      a.current_release_id === request.base_release_id &&
      a.revision === request.asset_revision &&
      source?.revision === request.source_revision &&
      available &&
      a.lifecycle === 'active' &&
      scan?.state === 'passed' &&
      scan?.ruleset_version === contentScanRuleset;
    const canDecide = request.state === 'pending' && independent && contextValid;
    const assetAi = has(principal, 'ai:execute', this.assets.assetContext(a));
    return {
      a,
      v,
      scan,
      canReview,
      contextValid,
      canDecide,
      canAuditVersion: canDecide && assetAi,
      canUseReviewAgent:
        independent &&
        available &&
        (assetAi ||
          (request.category === 'scenario' &&
            request.scenario_ids.length > 0 &&
            (await this.assets.canReview(principal, request, 'ai:execute')))),
    };
  }

  /** 已结束的申请保留历史读取权限，继续执行仍须满足当前审核条件。 */
  async requireAgentAccess(principal: Principal, id: string, mode: 'execute' | 'inspect') {
    return this.context.store.tx(async () => {
      const request = await this.context.store.get('requests', id);
      if (!request) notFound();
      const access = await this.reviewContext(principal, request);
      if (!access.canUseReviewAgent) fail(403, 'FORBIDDEN', '无权访问此申请的审核简报');
      if (mode === 'execute' && !access.canDecide)
        fail(409, 'REVIEW_STALE', '申请已处理或审核上下文已变化');
      return request;
    });
  }

  /** 基线、扫描和策略差异从同一申请的存储快照读取。 */
  async agentEvidence(ownerId: string, id: string) {
    return this.context.store.tx(async () => {
      const principal = await this.context.identity.principal(ownerId);
      const request = await this.requireAgentAccess(principal, id, 'execute');
      const review = await this.describe(principal, request);
      const before = review.current?.release.distribution.audience ?? [];
      const after = review.distribution.audience;
      const label = (audience: string[]) =>
        this.assets.formatVisibility({ ...review.distribution, audience });
      return {
        ...review,
        added_audience_label: await label(after.filter((item) => !before.includes(item))),
        removed_audience_label: await label(before.filter((item) => !after.includes(item))),
      };
    });
  }

  private async describe(principal: Principal, request: PublicationRequestRecord) {
    const { a, v, scan, canReview, contextValid, canDecide, canAuditVersion, canUseReviewAgent } =
      await this.reviewContext(principal, request);
    if (
      !canReview &&
      request.submitted_by !== principal.id &&
      !this.assets.canMaintain(principal, a)
    )
      fail(403, 'FORBIDDEN', '无审核权限');
    const current = await this.context.store.get('releases', request.base_release_id ?? '');
    const previous = current ? await this.context.store.get('versions', current.version_id) : null;
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
            content_digest: previous?.content_digest,
            manifest: previous?.manifest,
          }
        : null,
      scan,
      submitter: (await this.context.store.get('users', request.submitted_by))?.display_name,
      context_valid: contextValid,
      can_decide: canDecide,
      can_audit_version: canAuditVersion,
      can_use_review_agent: canUseReviewAgent,
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
  /**
   * 按 id 读取单个审核视图，供详情页复用队列项的同一套投影（含 `context_valid` 与 diff）。
   * 申请不存在时 `notFound`；既非审查者、非维护者、也非提交者时抛 403/`FORBIDDEN`，
   * 因此不能靠猜 id 探测他人申请。
   */
  async getReview(principal: Principal, id: string) {
    return this.context.store.tx(async () => {
      const request = await this.context.store.get('requests', id);
      if (!request) notFound();
      return await this.describe(principal, request);
    });
  }
}
