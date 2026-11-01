import { randomUUID } from 'node:crypto';
import { canonical, digest } from '@capability-hub/domain/canonical';
import { fail, notFound } from '@capability-hub/domain/errors';
import type { Principal } from '@capability-hub/domain/identity';
import type { AssetFeedbackRecord, VersionRecord } from '@capability-hub/domain/models';
import type { ApplicationContext } from '../shared/application-context.js';
import type { AssetAccessService } from './asset-access-service.js';
import type { AssetFeedbackCommand, AssetFeedbackUpdateCommand } from './commands.js';
import type { AssetFeedbackQuery } from './queries.js';

/** 反馈是使用证据；提交者的推断不直接改变资源状态或发布结论。 */
export class AssetFeedbackService {
  constructor(
    private readonly context: ApplicationContext,
    private readonly access: AssetAccessService,
    private readonly onReported?: (version: VersionRecord, feedbackId: string) => Promise<void>,
  ) {}

  private async present(record: AssetFeedbackRecord, principal: Principal) {
    const { request_key: _key, request_hash: _hash, ...feedback } = record;
    const asset = await this.access.getAsset(record.asset_id);
    const version = await this.context.store.get('versions', record.version_id);
    const fixed = await this.context.store.get('versions', record.fixed_version_id);
    const canManage = this.access.canMaintain(principal, asset);
    // 修复版本可能仍是私有候选，普通提交者只能看到有权读取的版本。
    const visibleFixed =
      fixed && (canManage || (await this.access.canRead(principal, asset, fixed)));
    return {
      ...feedback,
      fixed_version_id: visibleFixed ? fixed.id : null,
      version_label: version!.version_label,
      fixed_version_label: visibleFixed ? fixed.version_label : null,
      can_manage: canManage,
      detail_url: `/asset/${encodeURIComponent(asset.slug)}?feedback=${record.id}`,
    };
  }

  /**
   * 在 `store.tx` 内完成：版本可读性（404）→ `consent === true`（422/`FEEDBACK_CONSENT_REQUIRED`）
   * → 幂等键（缺失或超 200 字符抛 400/`IDEMPOTENCY_REQUIRED`）→ 同键异内容抛
   * 409/`IDEMPOTENCY_CONFLICT`。幂等键由请求体携带而非 `Idempotency-Key` 头，
   * 且每用户每小时上限 20 条（429/`FEEDBACK_RATE_LIMIT`，按创建时间滚动计算）。
   * 写入后记 `asset.feedback_submitted` 审计并触发 `onReported` 回调（回调异常会使整笔回滚）。
   */
  async report(principal: Principal, input: AssetFeedbackCommand) {
    return this.context.store.tx(async () => {
      const current = await this.context.identity.principal(principal.id);
      const version = await this.access.requireReadableVersion(current, input.version_id);
      if (input.consent !== true) fail(422, 'FEEDBACK_CONSENT_REQUIRED', '请先取得用户的上报授权');
      const { idempotency_key, consent: _consent, ...content } = input;
      if (!idempotency_key || idempotency_key.length > 200)
        fail(400, 'IDEMPOTENCY_REQUIRED', '需要有效幂等键');
      const hash = digest(canonical(content));
      const previous = await this.context.store.where('asset_feedback', 'submitted_by', current.id);
      const existing = previous.find((item) => item.request_key === idempotency_key);
      if (existing) {
        if (existing.request_hash !== hash)
          fail(409, 'IDEMPOTENCY_CONFLICT', '幂等键已用于不同反馈');
        return this.present(existing, current);
      }
      if (
        previous.filter((item) => Date.parse(item.created_at) > Date.now() - 3600000).length >= 20
      )
        fail(429, 'FEEDBACK_RATE_LIMIT', '每小时最多提交 20 条反馈，请稍后重试');
      const now = new Date().toISOString();
      const record = await this.context.store.insert('asset_feedback', {
        ...content,
        id: randomUUID(),
        asset_id: version.asset_id,
        submitted_by: current.id,
        request_key: idempotency_key,
        request_hash: hash,
        status: 'pending',
        resolution: '',
        fixed_version_id: null,
        updated_by: null,
        created_at: now,
        updated_at: now,
        revision: 1,
      });
      await this.context.store.audit(current.id, 'asset.feedback_submitted', version.id);
      await this.onReported?.(version, record.id);
      return this.present(record, current);
    });
  }

  /**
   * 维护者可看全部；否则仅提交者本人且其仍可读该版本，其余一律 404，
   * 使无权者无法通过 id 探测反馈是否存在。
   */
  async get(principal: Principal, id: string) {
    const current = await this.context.identity.principal(principal.id);
    const record = await this.context.store.get('asset_feedback', id);
    if (!record) notFound();
    const asset = await this.access.getAsset(record.asset_id);
    if (!this.access.canMaintain(current, asset)) {
      if (record.submitted_by !== current.id) notFound();
      await this.access.requireReadableVersion(current, record.version_id);
    }
    return this.present(record, current);
  }

  /**
   * 维护者可看该资产全部反馈；其他人先要求资产已发布且可读（404），再看得到本人
   * 且对应版本仍可读的条目。分页为 `page`/`limit`，按创建时间与 id 倒序，
   * `total` 是过滤后的总数而非本页条数；`status` 过滤在可见性收敛前生效。
   */
  async list(principal: Principal, assetId: string, query: AssetFeedbackQuery) {
    const current = await this.context.identity.principal(principal.id);
    const asset = await this.access.getAsset(assetId);
    const canManage = this.access.canMaintain(current, asset);
    if (!canManage) await this.access.requirePublishedAsset(current, asset.id);
    const records = await this.context.store.where('asset_feedback', 'asset_id', asset.id);
    const visible: AssetFeedbackRecord[] = [];
    for (const record of records) {
      if (query.status && record.status !== query.status) continue;
      if (!canManage) {
        if (record.submitted_by !== current.id) continue;
        const version = await this.context.store.get('versions', record.version_id);
        if (!version || !(await this.access.canRead(current, asset, version))) continue;
      }
      visible.push(record);
    }
    visible.sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id));
    return {
      items: await Promise.all(
        visible
          .slice((query.page - 1) * query.limit, query.page * query.limit)
          .map((item) => this.present(item, current)),
      ),
      total: visible.length,
      page: query.page,
      limit: query.limit,
    };
  }

  /**
   * 仅资产维护者（403）可改；在 `store.tx` 内以 `input.revision` 做乐观锁，
   * 不匹配抛 409/`REVISION_CONFLICT`（此处走请求体而非 `If-Match`）。
   * 置为 `resolved`/`declined` 时必须有处理说明（422/`RESOLUTION_REQUIRED`），
   * `fixed_version_id` 须属同一资产且状态为 `resolved`（422/`INVALID_FIXED_VERSION`）；
   * 保存后递增 revision 并写 `asset.feedback_updated` 审计。
   */
  async update(principal: Principal, id: string, input: AssetFeedbackUpdateCommand) {
    return this.context.store.tx(async () => {
      const current = await this.context.identity.principal(principal.id);
      const record = await this.context.store.get('asset_feedback', id);
      if (!record) notFound();
      const asset = await this.access.getAsset(record.asset_id);
      this.access.requireMaintenance(current, asset);
      if (record.revision !== input.revision)
        fail(409, 'REVISION_CONFLICT', '反馈已被更新，请刷新后重试');
      if (['resolved', 'declined'].includes(input.status) && !input.resolution.trim())
        fail(422, 'RESOLUTION_REQUIRED', '结束处理时请填写处理说明');
      if (input.fixed_version_id) {
        const fixed = await this.context.store.get('versions', input.fixed_version_id);
        if (input.status !== 'resolved' || !fixed || fixed.asset_id !== asset.id)
          fail(422, 'INVALID_FIXED_VERSION', '修复版本必须属于同一资产，且反馈状态为已解决');
      }
      const updated = await this.context.store.put('asset_feedback', {
        ...record,
        ...input,
        revision: record.revision + 1,
        updated_by: current.id,
        updated_at: new Date().toISOString(),
      });
      await this.context.store.audit(
        current.id,
        'asset.feedback_updated',
        record.version_id,
        undefined,
        { status: input.status },
      );
      return this.present(updated, current);
    });
  }
}
