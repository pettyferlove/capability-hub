import type { Principal } from '@capability-hub/domain/identity';
import { fail, notFound } from '@capability-hub/domain/errors';
import { collisionKey, sourcePath } from '@capability-hub/domain/paths';
import { has } from '@capability-hub/domain/rbac';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { PublicationService } from '../publication/publication-service.js';
import type { ApplicationContext } from '../shared/application-context.js';
import { matchRevision } from '../shared/revision.js';
import type { AssetAccessService } from './asset-access-service.js';
const now = () => new Date().toISOString();

/** 处理资产状态、来源迁移和已审核版本回退，保留历史发布证据。 */
export class AssetLifecycleService {
  constructor(
    private readonly context: ApplicationContext,
    private readonly assets: AssetAccessService,
    private readonly publications: PublicationService,
  ) {}
  /**
   * 要求 `asset:maintain`（否则 403/`FORBIDDEN`），仅 Skill 可改（否则 422/`NOT_SKILL`）；
   * `etag` 走 {@link matchRevision}，缺头 428/`IF_MATCH_REQUIRED`、不匹配 412/`REVISION_CONFLICT`。
   * 值未变化时直接返回且不递增 revision、不写审计，使重复提交保持幂等；
   * 变化时在 `store.tx` 内递增 revision、令待审请求失效（`ASSET_USAGE_CHANGED`）并写审计。
   */
  async updateUsage(p: Principal, id: string, body: unknown, etag: string | undefined) {
    const b = z.object({ requires_api_key: z.boolean() }).strict().parse(body);
    return await this.context.store.tx(async () => {
      const actor = await this.context.identity.principal(p.id);
      const asset = await this.assets.getAsset(id);
      this.assets.requireMaintenance(actor, asset);
      if (asset.kind !== 'skill') fail(422, 'NOT_SKILL', '仅 Skill 支持 API Key 需求标识');
      matchRevision(asset, etag);
      const requiresApiKey = asset.requires_api_key === true;
      if (requiresApiKey === b.requires_api_key) return asset;
      const next = await this.context.store.put('assets', {
        ...asset,
        requires_api_key: b.requires_api_key,
        revision: asset.revision + 1,
      });
      await this.publications.invalidatePending(asset.id, 'ASSET_USAGE_CHANGED');
      await this.context.store.audit(actor.id, 'asset.usage_updated', asset.id, '', {
        changes: [{ field: 'requires_api_key', before: requiresApiKey, after: b.requires_api_key }],
      });
      return next;
    });
  }
  /**
   * `deprecated` 是唯一允许由维护者代行的降级路径；其余状态（含 `active`、`blocked`）
   * 必须持有 `asset:lifecycle`（作用域 team/source/asset），不满足抛 403。
   * `etag` 经 {@link matchRevision} 校验（428/412）；替代资产不能是自身
   * （422/`INVALID_REPLACEMENT`）且必须是已发布可读资产（404）。
   * 在 `store.tx` 内递增 revision、令待审请求失效并写 `asset.<lifecycle>` 审计。
   */
  async updateState(p: Principal, id: string, body: unknown, etag: string | undefined) {
    const b = z
      .object({
        lifecycle: z.enum(['active', 'deprecated', 'blocked']),
        reason: z.string().trim().min(1).max(2000),
        replacement_asset_id: z.uuid().nullable().optional(),
      })
      .strict()
      .parse(body);
    return await this.context.store.tx(async () => {
      const actor = await this.context.identity.principal(p.id);
      const a = await this.assets.getAsset(id);
      if (
        b.lifecycle === 'deprecated' &&
        a.lifecycle !== 'blocked' &&
        !has(actor, 'asset:lifecycle', this.assets.assetContext(a))
      )
        this.assets.requireMaintenance(actor, a);
      else this.context.identity.require(actor, 'asset:lifecycle', this.assets.assetContext(a));
      matchRevision(a, etag);
      if (b.replacement_asset_id === a.id) fail(422, 'INVALID_REPLACEMENT', '替代资产不能是自身');
      if (b.replacement_asset_id)
        await this.assets.requirePublishedAsset(actor, b.replacement_asset_id);
      const next = await this.context.store.put('assets', {
        ...a,
        lifecycle: b.lifecycle,
        deprecation_reason: b.reason,
        replacement_asset_id: b.replacement_asset_id ?? null,
        revision: a.revision + 1,
      });
      await this.publications.invalidatePending(a.id, 'ASSET_LIFECYCLE_CHANGED');
      await this.context.store.audit(p.id, 'asset.' + b.lifecycle, a.id, b.reason);
      return next;
    });
  }
  /**
   * 需要全局 `version:revoke`（无团队作用域），事务外与事务内各校验一次；
   * 原因为空抛 422/`REASON_REQUIRED`。在 `store.tx` 内把版本置为 `revoked`、
   * 递增资产 revision 令 `If-Match` 失效、作废待审请求并写 `version.revoked` 审计。
   */
  async revokeVersion(p: Principal, id: string, reason: string) {
    this.context.identity.require(p, 'version:revoke');
    if (!reason.trim()) fail(422, 'REASON_REQUIRED', '需要撤销原因');
    return await this.context.store.tx(async () => {
      const actor = await this.context.identity.principal(p.id);
      this.context.identity.require(actor, 'version:revoke');
      const v = await this.context.store.get('versions', id);
      if (!v) notFound();
      const a = await this.assets.getAsset(v.asset_id);
      await this.context.store.put('versions', { ...v, availability: 'revoked' });
      await this.context.store.put('assets', { ...a, revision: a.revision + 1 });
      await this.publications.invalidatePending(a.id, 'VERSION_REVOKED');
      await this.context.store.audit(p.id, 'version.revoked', v.id, reason);
      return { ok: true };
    });
  }
  /**
   * 迁移需全局 `asset:migrate`，并对新旧来源各自持有 `source:manage` 与 `source:share`；
   * `etag` 经 {@link matchRevision}（428/412），另要求调用方带上目标来源当前 revision
   * （不符抛 412/`REVISION_CONFLICT`）。目标须为未屏蔽的 git 来源
   * （422/`DESTINATION_SOURCE`）、不得与现来源相同（`SAME_SOURCE`），
   * 且路径不得与目标来源已有绑定重叠（`OVERLAPPING_PATH`）。在 `store.tx` 内退休旧绑定、
   * 迁移归属团队、让目标来源立即轮询（`next_poll_at`），旧来源无有效绑定时转为 `paused`，
   * 并作废相关资产的待审请求、写 `asset.source_migrated` 审计。
   */
  async migrateSource(p: Principal, id: string, body: unknown, etag: string | undefined) {
    const b = z
      .object({
        destination_source_id: z.uuid(),
        path: z.string().min(1).max(240),
        reason: z.string().trim().min(1).max(2000),
        destination_source_revision: z.number().int().positive(),
      })
      .strict()
      .parse(body);
    this.context.identity.require(p, 'asset:migrate');
    return await this.context.store.tx(async () => {
      const actor = await this.context.identity.principal(p.id);
      this.context.identity.require(actor, 'asset:migrate');
      const a = await this.assets.getAsset(id);
      matchRevision(a, etag);
      const old = (await this.context.store.get('sources', a.source_id))!,
        destination = await this.context.store.get('sources', b.destination_source_id);
      if (!destination || destination.kind !== 'git' || destination.state === 'blocked')
        fail(422, 'DESTINATION_SOURCE', '迁移目标来源不可用');
      if (destination.id === old.id) fail(422, 'SAME_SOURCE', '路径调整请编辑当前来源');
      if (destination.revision !== b.destination_source_revision)
        fail(412, 'REVISION_CONFLICT', '目标来源配置已变化');
      this.assets.requireSourceManagement(actor, old);
      this.assets.requireSourceManagement(actor, destination);
      this.context.identity.require(actor, 'source:share', {
        source: old.id,
        team: old.owner_group_id,
      });
      this.context.identity.require(actor, 'source:share', {
        source: destination.id,
        team: destination.owner_group_id,
      });
      sourcePath(b.path, a.kind);
      const targets = (
        await this.context.store.where('bindings', 'source_id', destination.id)
      ).filter((t) => !t.retired_at);
      if (
        targets.some(
          (t) =>
            collisionKey(t.path) === collisionKey(b.path) ||
            (t.enabled &&
              (collisionKey(t.path) === '.' ||
                collisionKey(b.path) === '.' ||
                collisionKey(t.path).startsWith(collisionKey(b.path) + '/') ||
                collisionKey(b.path).startsWith(collisionKey(t.path) + '/'))),
        )
      )
        fail(422, 'OVERLAPPING_PATH', '目标路径与已有绑定重叠');
      const timestamp = now();
      for (const t of (await this.context.store.where('bindings', 'asset_id', a.id)).filter(
        (t) => !t.retired_at,
      ))
        await this.context.store.put('bindings', { ...t, retired_at: timestamp, enabled: false });
      const current = await this.context.store.get('releases', a.current_release_id ?? '');
      await this.context.store.put('assets', {
        ...a,
        source_id: destination.id,
        owner_group_id: destination.owner_group_id,
        revision: a.revision + 1,
      });
      const binding = await this.context.store.insert('bindings', {
        id: randomUUID(),
        source_id: destination.id,
        asset_id: a.id,
        path: b.path,
        enabled: true,
        retired_at: null,
        category: current?.category ?? 'uncategorized',
        scenario_ids: current?.scenario_ids ?? [],
        distribution: current?.distribution ?? {
          mode: 'approved_audience',
          audience: ['group:' + destination.owner_group_id],
        },
        applies_to: current?.applies_to ?? {},
        created_at: timestamp,
      });
      await this.context.store.put('sources', {
        ...destination,
        revision: destination.revision + 1,
        next_poll_at: Date.now(),
      });
      await this.context.store.put('sources', {
        ...old,
        revision: old.revision + 1,
        ...(!(await this.context.store.where('bindings', 'source_id', old.id)).some(
          (t) => !t.retired_at && t.enabled,
        )
          ? { state: 'paused' }
          : {}),
      });
      for (const asset of (await this.context.store.all('assets')).filter((x) =>
        [old.id, destination.id].includes(x.source_id),
      ))
        await this.publications.invalidatePending(asset.id, 'SOURCE_MIGRATED');
      await this.context.store.audit(p.id, 'asset.source_migrated', a.id, b.reason, {
        old_source_id: old.id,
        destination_source_id: destination.id,
        binding_id: binding.id,
      });
      return { asset_id: a.id, binding_id: binding.id, source_id: destination.id };
    });
  }
  /**
   * 要求 `asset:maintain`（403）；回退目标必须是同资产、曾发布、未撤销的版本
   * （否则 409/`ROLLBACK_UNAVAILABLE`），且 `current_policy_digest` 须与当前发布一致
   * （否则 409/`POLICY_MISMATCH`，防止基于过期策略发起）。本方法不自持事务，
   * 而是把历史版本作为新发布委托给 {@link PublicationService.submit}，
   * 幂等由 `Idempotency-Key`（`key`）在 `publication-requests` 作用域内落实，
   * 故回退与普通提交共用同一键空间，重放同一键返回原申请。
   */
  async requestRollback(principal: Principal, id: string, body: unknown, key: string | undefined) {
    const b = z
      .object({
        target_version_id: z.uuid(),
        reason: z.string().trim().min(1).max(2000),
        current_policy_digest: z.string(),
      })
      .strict()
      .parse(body);
    const a = await this.assets.getAsset(id);
    this.assets.requireMaintenance(principal, a);
    const current = await this.context.store.get('releases', a.current_release_id ?? '');
    const v = await this.context.store.get('versions', b.target_version_id);
    if (
      !current ||
      !v ||
      v.asset_id !== a.id ||
      !(await this.assets.latestReleaseForVersion(v)) ||
      v.availability === 'revoked'
    )
      fail(409, 'ROLLBACK_UNAVAILABLE', '回退目标不是有效历史版本');
    if (current.policy_digest !== b.current_policy_digest)
      fail(409, 'POLICY_MISMATCH', '当前策略变化');
    const intake = (await this.context.store.get('intakes', v.intake_id))!;
    return await this.publications.submit(
      principal,
      {
        source_intake_id: intake.id,
        version_id: v.id,
        category: current.category,
        scenario_ids: current.scenario_ids,
        distribution: current.distribution,
        applies_to: current.applies_to,
        ...(a.kind === 'skill'
          ? {
              requires_api_key:
                (await this.assets.latestReleaseForVersion(v)).requires_api_key === true,
            }
          : {}),
        purpose: b.reason,
        base_release_id: a.current_release_id,
      },
      key,
      true,
    );
  }
}
