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
    private readonly onSubmitted?: (principal: Principal, versionId: string) => Promise<void>,
  ) {}
  /**
   * 提交与批准共用的策略自洽校验，只读不写；任一规则不满足即抛 422 并中止后续冻结。
   * 分类与场景必须互为充要（`scenario` ⇔ 非空且不超过 20 个、不可重复），受众 1–100 条
   * 不可重复，`public` 与 `organization` 只能独占，分发模式只能是 `approved_audience`。
   * 场景、组、用户逐条回查存储并要求仍 active，因此是异步校验，不能只在请求入口做一次。
   */
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
  /**
   * 复核接收记录与服务端版本是否同源，并确认来源的分发授权未被 block 或撤销，
   * 返回来源记录供调用方继续做 `source:share` 判定。来源失效 → 409/`SOURCE_BLOCKED`，
   * intake 与版本不一致 → 409/`INTAKE_MISMATCH`。
   * `historical` 为 true 时跳过"来源修订号 + binding 现况"校验：历史导入按当时证据成立，
   * 不再要求来源配置未变；否则配置漂移、binding 停用或迁移会抛 409/`SOURCE_CONFIG_CHANGED`
   * 与 `BINDING_CHANGED`。冻结前与批准前各调用一次，确保审核期间证据没被换掉。
   */
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
  /**
   * 发起待审申请：把同意凭证、扫描证据、来源修订号与 `rulesDigest` 冻结进同一记录，
   * 使审核期无需重新读取来源即可判定，且批准时能发现上下文漂移。
   * 由 `IdempotencyService.execute` 包裹（route `publication-requests`，键取自请求头
   * `Idempotency-Key`），摘要包含 `historical`，因此同键同摘要重放返回原申请而非新建。
   * 事务外先做 `asset:maintain` 与版本存在性检查，事务内再复查一次以免检查后被并发改动。
   * 会抛 422/`NOT_SKILL`（只有 Skill 能声明 `requires_api_key`）、`INVALID_POLICY` 系列，
   * 409/`UNAVAILABLE`、`BASE_RELEASE_CHANGED`、`SCAN_REQUIRED`、`PENDING_EXISTS`、
   * `SOURCE_BLOCKED`、`INTAKE_MISMATCH`，并要求 `source:share`（source + owner 团队作用域）。
   * 成功时写 `publication.submitted` 审计并触发 `onSubmitted` 通知钩子。
   * @param key - 幂等键，缺失或超长时由幂等层抛 400/`IDEMPOTENCY_REQUIRED`。
   * @param historical - 历史导入标记，同时落入申请记录并放宽证据复核。
   */
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
    if (a.kind !== 'skill' && b.requires_api_key !== undefined)
      fail(422, 'NOT_SKILL', '仅 Skill 支持 API Key 需求声明');
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
          ...(a.kind === 'skill'
            ? {
                requires_api_key:
                  b.requires_api_key ?? intake.requires_api_key ?? a.requires_api_key === true,
              }
            : {}),
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
        await this.onSubmitted?.(principal, request.version_id);
        return request;
      },
    );
  }
  /**
   * 把已发布版本提名为 `general` 候选：复用原申请的来源同意与扫描证据，仅在冻结记录里
   * 追加 `nomination` 原文，避免提名绕过首次提交的授权链。
   * 由 `IdempotencyService.execute` 包裹（route `nominations`，键取自 `Idempotency-Key`）。
   * 需能读取该版本；发布已不是资产当前发布、资产非 active → 409/`BASE_RELEASE_CHANGED`，
   * 已是 general → 409/`ALREADY_GENERAL`，该版本已有待审申请 → 409/`PENDING_EXISTS`，
   * 扫描记录不是当前 `contentScanRuleset` 通过 → 409/`SCAN_REQUIRED`（要求维护者重扫）。
   * 提名固定 `category: 'general'` 且 `scenario_ids` 为空，并把 `base_release_id` 记为
   * 被提名的发布，成功时写 `publication.nominated` 审计并触发 `onSubmitted`。
   */
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
          ...(asset.kind === 'skill' ? { requires_api_key: asset.requires_api_key === true } : {}),
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
        await this.onSubmitted?.(principal, request.version_id);
        return request;
      },
    );
  }
  /**
   * 审核决策入口，approve 时在同一事务内写入发布记录、推进版本可用性、
   * 更新资产 `current_release_id` 与申请状态，任一失败整体回滚。
   * 权限走 `canReview`：通用范围、含 `public`/`organization` 或跨团队的受众要求平台级
   * `review:decide`；`scenario` 分类要求覆盖全部场景的 `review:decide`；其余按
   * `review:decide` + 资产 owner 团队。提交者与通用提名的来源共享者都不得自审，
   * 否则 403/`SELF_REVIEW`；越权 403/`FORBIDDEN`。
   * 批准前先确认文件的 blob 与归档/清单存在（503/`BLOB_MISSING`），刻意放在取写事务锁之前。
   * 由 `IdempotencyService.execute` 包裹（route `decision/<id>`），摘要只含决策体，
   * 因此同键重放不会重复发版。事务内先 `matchRevision`（缺 `If-Match` → 428，
   * 修订号不符 → 412），再比对 `policy_digest`（不符 → 409/`POLICY_MISMATCH`）。
   * `accepted_warnings` 必须与本次扫描的 warning finding 一一对应、不可重复且各附理由，
   * 否则 422/`INVALID_WARNING_ACCEPTANCE`；漏接受任一告警则 422/`WARNING_ACCEPTANCE_REQUIRED`。
   * 其余拒绝情形：已处理 409/`REVIEW_RESOLVED`、退回无意见 422/`COMMENT_REQUIRED`、
   * 上下文漂移 409/`REVIEW_STALE`、内容或扫描失效 409/`CONTENT_UNAVAILABLE`、
   * 提交者授权失效 409/`CONSENT_REVOKED`。
   * @param etag - 客户端读取时的修订号（`If-Match` 原样值，含引号）。
   * @param key - 幂等键，缺失或超长时由幂等层抛 400/`IDEMPOTENCY_REQUIRED`。
   */
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
          ...(a.kind === 'skill' ? { requires_api_key: r.requires_api_key === true } : {}),
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
          ...(a.kind === 'skill' ? { requires_api_key: r.requires_api_key === true } : {}),
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
  /**
   * 撤回待审申请；自己提交的可直接撤回，其他人代为撤回需要 `asset:maintain`。
   * `input` 按严格 schema 解析（只允许 `reason`，1–2000 字），形状不符由 zod 直接抛出
   * 校验错误而非 `HubError`。自行开启 `store.tx`，`matchRevision` 校验 `If-Match`
   * （缺失 → 428/`IF_MATCH_REQUIRED`，不符 → 412/`REVISION_CONFLICT`），
   * 只有 `pending` 可撤回（否则 409/`REVIEW_RESOLVED`），成功后写 `publication.cancelled` 审计。
   */
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

  /**
   * 把该资产所有 `pending` 申请批量置为 `stale` 并记录原因码，防止资产已变更后仍被批准。
   * 不做授权判断、不自己开事务：资产生命周期、版本撤销与来源变更等副作用在各自事务内调用，
   * 原因码是调用方给出的常量（如 `ASSET_LIFECYCLE_CHANGED`、`SOURCE_MIGRATED`）。
   */
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
