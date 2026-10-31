import { contentScanRuleset } from '@capability-hub/domain/content';
import type { Finding } from '@capability-hub/domain/content';
import type { Policy } from '@capability-hub/domain/policy';
import type { Principal } from '@capability-hub/domain/identity';
import type {
  SubmitPublicationCommand,
  PublicationDecisionCommand,
  NominateAssetCommand,
} from './commands.js';
import type { IntakeRecord, VersionRecord } from '@capability-hub/domain/models';
import { canonical, digest, utf8Compare } from '@capability-hub/domain/canonical';
import { fail, notFound } from '@capability-hub/domain/errors';
import { has } from '@capability-hub/domain/rbac';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { AssetAccessService } from '../catalog/asset-access-service.js';
import type { ApplicationContext } from '../shared/application-context.js';
import type { IdempotencyService } from '../shared/idempotency-service.js';
import { matchRevision } from '../shared/revision.js';
const now = () => new Date().toISOString();
const rulesDigest = digest(
  canonical({
    ruleset: contentScanRuleset,
    review_policy: 'non-self-platform-public-general-expanded-scenario-team-v2',
  }),
);
/** 提交时冻结授权和内容证据；独立审核通过后，发布记录与资产指针在同一事务提交。 */
export class PublicationService {
  constructor(
    private readonly context: ApplicationContext,
    private readonly assets: AssetAccessService,
    private readonly idempotency: IdempotencyService,
  ) {}
  async validatePolicy(value: Policy) {
    if (
      (value.category === 'scenario') !== !!value.scenario_ids.length ||
      new Set(value.scenario_ids).size !== value.scenario_ids.length ||
      value.scenario_ids.length > 20
    )
      fail(422, 'INVALID_POLICY', '场景分类与适用场景不匹配');
    const audience = value.distribution.audience;
    if (
      !audience.length ||
      audience.length > 100 ||
      new Set(audience).size !== audience.length ||
      (audience.some((entry) => entry === 'public' || entry === 'organization') &&
        audience.length !== 1)
    )
      fail(422, 'INVALID_AUDIENCE', '分发受众为空、重复或混用了互斥范围');
    if (value.distribution.mode !== 'approved_audience')
      fail(422, 'INVALID_DISTRIBUTION', '分发需要明确批准受众');
    for (const id of value.scenario_ids)
      if (!(await this.context.store.get('scenarios', id))?.active)
        fail(422, 'INVALID_SCENARIO', '场景无效');
    for (const id of value.distribution.audience) {
      if (id === 'public' || id === 'organization') continue;
      const [type, uuid] = id.split(':');
      if (!(await this.context.store.get(type === 'group' ? 'groups' : 'users', uuid))?.active)
        fail(422, 'INVALID_AUDIENCE', '受众不存在或已停用');
    }
  }
  async verifyEvidence(intake: IntakeRecord, version: VersionRecord, historical = false) {
    const s = await this.context.store.get('sources', intake.source_id);
    if (!s || s.state === 'blocked' || s.distribution_revoked_at)
      fail(409, 'SOURCE_BLOCKED', '来源分发授权已撤销');
    if (
      intake.asset_id !== version.asset_id ||
      intake.state !== 'ready' ||
      intake.version_id !== version.id ||
      intake.content_digest !== version.content_digest
    )
      fail(409, 'INTAKE_MISMATCH', '接收证据与版本不匹配');
    if (!historical) {
      if (s.revision !== intake.source_revision)
        fail(409, 'SOURCE_CONFIG_CHANGED', '来源配置已变化，请重新同步');
      if (intake.binding_id) {
        const b = await this.context.store.get('bindings', intake.binding_id);
        if (
          !b ||
          b.retired_at ||
          !b.enabled ||
          b.asset_id !== version.asset_id ||
          b.source_id !== s.id ||
          s.state !== 'active'
        )
          fail(409, 'BINDING_CHANGED', '读取目标已停用或迁移');
      }
    }
    return s;
  }
  async submit(
    principal: Principal,
    body: SubmitPublicationCommand,
    key: string | undefined,
    historical = false,
  ) {
    const b = body;
    const v = await this.context.store.get('versions', b.version_id);
    if (!v) notFound();
    const a = await this.assets.getAsset(v.asset_id);
    this.assets.requireMaintenance(principal, a);
    return await this.idempotency.execute(
      principal,
      'publication-requests',
      key,
      digest(canonical({ ...b, historical })),
      async () => {
        const v = await this.context.store.get('versions', b.version_id);
        if (!v) notFound();
        const a = await this.assets.getAsset(v.asset_id);
        this.assets.requireMaintenance(principal, a);
        await this.validatePolicy(b);
        const intake = await this.context.store.get('intakes', b.source_intake_id);
        if (!intake) notFound();
        const source = await this.verifyEvidence(
          intake,
          v,
          historical || intake.historical === true,
        );
        if (a.lifecycle !== 'active' || v.availability === 'revoked')
          fail(409, 'UNAVAILABLE', '资产已弃用、封禁或版本已撤销，不能提交审核');
        if (a.current_release_id !== b.base_release_id)
          fail(409, 'BASE_RELEASE_CHANGED', '当前发布已变化，请刷新');
        this.context.identity.require(principal, 'source:share', {
          source: source.id,
          team: source.owner_group_id,
        });
        const scan = await this.context.store.get('scans', intake.scan_run_id);
        if (
          !scan ||
          scan.state !== 'passed' ||
          scan.ruleset_version !== contentScanRuleset ||
          scan.version_id !== v.id
        )
          fail(409, 'SCAN_REQUIRED', '需要有效扫描通过记录');
        if (
          (await this.context.store.all('requests')).some(
            (r) => r.asset_id === a.id && r.version_id === v.id && r.state === 'pending',
          )
        )
          fail(409, 'PENDING_EXISTS', '该版本已有待审申请');
        const consent = {
          actor_id: principal.id,
          confirmed_at: now(),
          permission_basis: 'source:share',
          purpose: b.purpose,
          content_digest: v.content_digest,
          audience: [...b.distribution.audience].sort(utf8Compare),
        };
        const frozen = {
          asset_id: a.id,
          version_id: v.id,
          source_intake_id: intake.id,
          content_digest: v.content_digest,
          category: b.category,
          scenario_ids: [...b.scenario_ids].sort(utf8Compare),
          distribution: { ...b.distribution, audience: consent.audience },
          applies_to: b.applies_to,
          policy_source_id: source.id,
          source_revision: source.revision,
          source_consent: consent,
          scan_run_id: scan.id,
          ruleset_version: contentScanRuleset,
          approval_policy_digest: rulesDigest,
          base_release_id: a.current_release_id,
          asset_revision: a.revision,
        };
        const bytes = canonical(frozen);
        const request = await this.context.store.insert('requests', {
          id: randomUUID(),
          ...frozen,
          canonical_policy_json: bytes,
          policy_digest: digest(bytes),
          historical: historical || intake.historical === true,
          state: 'pending',
          submitted_by: principal.id,
          created_at: now(),
          revision: 1,
        });
        await this.context.store.audit(
          principal.id,
          'publication.submitted',
          request.id,
          b.purpose,
        );
        return request;
      },
    );
  }
  async nominate(principal: Principal, body: NominateAssetCommand, key: string | undefined) {
    const b = body;
    return await this.idempotency.execute(
      principal,
      'nominations',
      key,
      digest(canonical(b)),
      async () => {
        const release = await this.context.store.get('releases', b.release_id);
        if (!release) notFound();
        const version = await this.assets.requireReadableVersion(principal, release.version_id);
        const asset = await this.assets.getAsset(release.asset_id);
        if (asset.current_release_id !== release.id || asset.lifecycle !== 'active')
          fail(409, 'BASE_RELEASE_CHANGED', '当前发布已变化，请刷新后重新提名');
        if (release.category === 'general') fail(409, 'ALREADY_GENERAL', '该资源已是通用资源');
        if (
          (await this.context.store.where('requests', 'asset_id', asset.id)).some(
            (request) => request.version_id === version.id && request.state === 'pending',
          )
        )
          fail(409, 'PENDING_EXISTS', '该版本已有待审申请，请等待审核结果');
        const original = (await this.context.store.get('requests', release.request_id))!;
        const intake = (await this.context.store.get('intakes', original.source_intake_id))!;
        const source = await this.verifyEvidence(intake, version, original.historical);
        const scan = await this.context.store.get('scans', intake.scan_run_id);
        if (!scan || scan.state !== 'passed' || scan.ruleset_version !== contentScanRuleset)
          fail(409, 'SCAN_REQUIRED', '需要维护者按当前规则重新扫描后再提名');
        const frozen = {
          asset_id: asset.id,
          version_id: version.id,
          source_intake_id: intake.id,
          content_digest: version.content_digest,
          category: 'general' as const,
          scenario_ids: [],
          distribution: release.distribution,
          applies_to: release.applies_to,
          policy_source_id: source.id,
          source_revision: source.revision,
          source_consent: release.source_consent,
          scan_run_id: scan.id,
          ruleset_version: contentScanRuleset,
          approval_policy_digest: rulesDigest,
          base_release_id: release.id,
          asset_revision: asset.revision,
          nomination: b,
        };
        const bytes = canonical(frozen);
        const request = await this.context.store.insert('requests', {
          id: randomUUID(),
          ...frozen,
          canonical_policy_json: bytes,
          policy_digest: digest(bytes),
          historical: original.historical,
          state: 'pending',
          submitted_by: principal.id,
          created_at: now(),
          revision: 1,
        });
        await this.context.store.audit(principal.id, 'publication.nominated', request.id, b.reason);
        return request;
      },
    );
  }
  async decide(
    p: Principal,
    id: string,
    body: PublicationDecisionCommand,
    etag: string | undefined,
    key: string | undefined,
  ) {
    const b = body;
    const request = await this.context.store.get('requests', id);
    if (!request) notFound();
    if (!(await this.assets.canReview(p, request))) fail(403, 'FORBIDDEN', '无对应范围审核权限');
    if (request.submitted_by === p.id) fail(403, 'SELF_REVIEW', '提交者不能审核自己的申请');
    if (request.nomination && request.source_consent.actor_id === p.id)
      fail(403, 'SELF_REVIEW', '来源共享者不能审核自己资源的通用提名');
    // 版本引用不可变，先核验远程内容，再获取写事务锁。
    if (b.decision === 'approve' && request.state === 'pending') {
      const version = (await this.context.store.get('versions', request.version_id))!;
      for (const f of version.files)
        if (!(await this.context.blobs.exists(f.blob_ref)))
          fail(503, 'BLOB_MISSING', '审核内容缺失，不能批准');
      if (
        !(await this.context.blobs.exists(version.artifact_ref)) ||
        !(await this.context.blobs.exists(version.manifest_ref))
      )
        fail(503, 'BLOB_MISSING', '归档或清单缺失');
    }
    return await this.idempotency.execute(
      p,
      'decision/' + id,
      key,
      digest(canonical(b)),
      async () => {
        const r = (await this.context.store.get('requests', id))!;
        if (!(await this.assets.canReview(p, r))) fail(403, 'FORBIDDEN', '无对应范围审核权限');
        matchRevision(r, etag);
        if (r.state !== 'pending') fail(409, 'REVIEW_RESOLVED', '申请已处理或失效');
        if (b.policy_digest !== r.policy_digest) fail(409, 'POLICY_MISMATCH', '审核策略摘要已变化');
        if (b.decision === 'reject') {
          if (!b.comment.trim()) fail(422, 'COMMENT_REQUIRED', '退回必须填写意见');
          const result = await this.context.store.put('requests', {
            ...r,
            state: 'rejected',
            decision_by: p.id,
            decision_reason: b.comment,
            decided_at: now(),
            revision: r.revision + 1,
          });
          await this.context.store.audit(p.id, 'publication.rejected', id, b.comment);
          return result;
        }
        await this.validatePolicy(r);
        const a = await this.assets.getAsset(r.asset_id);
        const v = (await this.context.store.get('versions', r.version_id))!;
        const intake = (await this.context.store.get('intakes', r.source_intake_id))!;
        const source = await this.verifyEvidence(intake, v, r.historical);
        const scan = (await this.context.store.get('scans', r.scan_run_id))!;
        if (
          a.current_release_id !== r.base_release_id ||
          a.revision !== r.asset_revision ||
          source.revision !== r.source_revision ||
          r.approval_policy_digest !== rulesDigest
        )
          fail(409, 'REVIEW_STALE', '审核上下文已变化，请重新提交');
        if (
          a.lifecycle !== 'active' ||
          v.availability === 'revoked' ||
          scan.state !== 'passed' ||
          scan.ruleset_version !== contentScanRuleset
        )
          fail(409, 'CONTENT_UNAVAILABLE', '内容或扫描已失效');
        const submitter = await this.context.identity.principal(
          r.nomination ? r.source_consent.actor_id : r.submitted_by,
        );
        if (r.nomination)
          await this.assets.requireReadableVersion(
            await this.context.identity.principal(r.submitted_by),
            v.id,
          );
        if (
          !has(submitter, 'source:share', { source: source.id, team: source.owner_group_id }) ||
          !this.assets.canMaintain(submitter, a)
        )
          fail(409, 'CONSENT_REVOKED', '提交者授权已失效');
        const warnings = scan.findings.filter((finding: Finding) => finding.severity === 'warning');
        const accepted = new Set(b.accepted_warnings.map((warning) => warning.finding_id));
        if (
          accepted.size !== b.accepted_warnings.length ||
          b.accepted_warnings.some(
            (warning) =>
              !warning.reason.trim() ||
              !warnings.some((finding) => finding.id === warning.finding_id),
          )
        )
          fail(
            422,
            'INVALID_WARNING_ACCEPTANCE',
            '接受告警必须逐条对应当前扫描且说明理由，不得重复',
          );
        if (warnings.some((finding) => !accepted.has(finding.id)))
          fail(422, 'WARNING_ACCEPTANCE_REQUIRED', '每条告警需要明确接受理由');
        const seq =
          Math.max(
            0,
            ...(await this.context.store.all('releases'))
              .filter((x) => x.asset_id === a.id)
              .map((x) => x.release_seq),
          ) + 1;
        const release = await this.context.store.insert('releases', {
          id: randomUUID(),
          asset_id: a.id,
          version_id: v.id,
          request_id: r.id,
          release_seq: seq,
          category: r.category,
          scenario_ids: r.scenario_ids,
          distribution: r.distribution,
          applies_to: r.applies_to,
          policy_source_id: r.policy_source_id,
          source_revision: r.source_revision,
          policy_digest: r.policy_digest,
          source_consent: r.source_consent,
          published_by: p.id,
          published_at: now(),
        });
        if (v.availability === 'unreleased')
          await this.context.store.put('versions', { ...v, availability: 'released' });
        await this.context.store.put('assets', {
          ...a,
          current_release_id: release.id,
          revision: a.revision + 1,
        });
        const result = await this.context.store.put('requests', {
          ...r,
          state: 'approved',
          decision_by: p.id,
          decision_reason: b.comment,
          accepted_warnings: b.accepted_warnings,
          decided_at: now(),
          revision: r.revision + 1,
        });
        await this.context.store.audit(p.id, 'publication.approved', id, b.comment, {
          release_id: release.id,
        });
        return result;
      },
    );
  }
  async cancel(principal: Principal, id: string, input: unknown, etag: string | undefined) {
    const value = z
      .object({ reason: z.string().trim().min(1).max(2000) })
      .strict()
      .parse(input);
    return await this.context.store.tx(async () => {
      const actor = await this.context.identity.principal(principal.id);
      const request = await this.context.store.get('requests', id);
      if (!request) notFound();
      if (request.submitted_by !== actor.id)
        this.assets.requireMaintenance(actor, await this.assets.getAsset(request.asset_id));
      matchRevision(request, etag);
      if (request.state !== 'pending') fail(409, 'REVIEW_RESOLVED', '只能撤回待审申请');
      await this.context.store.put('requests', {
        ...request,
        state: 'cancelled',
        revision: request.revision + 1,
      });
      await this.context.store.audit(actor.id, 'publication.cancelled', id, value.reason);
      return { ok: true };
    });
  }

  async invalidatePending(assetId: string, reason: string) {
    for (const r of (await this.context.store.all('requests')).filter(
      (r) => r.asset_id === assetId && r.state === 'pending',
    ))
      await this.context.store.put('requests', {
        ...r,
        state: 'stale',
        stale_reason: reason,
        revision: r.revision + 1,
      });
  }
}
