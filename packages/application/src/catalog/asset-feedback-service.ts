import { randomUUID } from 'node:crypto';
import { canonical, digest } from '@capability-hub/domain/canonical';
import { fail, notFound } from '@capability-hub/domain/errors';
import type { Principal } from '@capability-hub/domain/identity';
import type { AssetFeedbackRecord } from '@capability-hub/domain/models';
import type { ApplicationContext } from '../shared/application-context.js';
import type { AssetAccessService } from './asset-access-service.js';
import type { AssetFeedbackCommand, AssetFeedbackUpdateCommand } from './commands.js';
import type { AssetFeedbackQuery } from './queries.js';

/** 反馈是使用证据；提交者的推断不直接改变资源状态或发布结论。 */
export class AssetFeedbackService {
  constructor(
    private readonly context: ApplicationContext,
    private readonly access: AssetAccessService,
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
      return this.present(record, current);
    });
  }

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
