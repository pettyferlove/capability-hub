import type { Principal } from '@capability-hub/domain/identity';
import type { RecommendationCommand } from './commands.js';
import { filterAsync } from '@capability-hub/domain/async';
import { randomUUID } from 'node:crypto';
import type { ApplicationContext } from '../shared/application-context.js';
import type { AssetAccessService } from './asset-access-service.js';

/**
 * 资产推荐与提名摘要。写操作要求登录并具备版本可读权限（不可读抛 404），整体在
 * `store.tx` 内先校验再增删并写审计；推荐是集合语义的幂等开关，因此不经幂等服务。
 */
export class AssetCommunityService {
  constructor(
    private readonly context: ApplicationContext,
    private readonly access: AssetAccessService,
  ) {}
  /**
   * 只统计仍处于启用状态用户的推荐，停用账户的历史推荐不计入；
   * 提名取该发布下第一条 `pending` 请求，因此未登录调用不会暴露提名内容归属。
   */
  async summary(versionId: string, releaseId: string, principal: Principal | null) {
    const recommendations = await filterAsync(
      await this.context.store.where('recommendations', 'version_id', versionId),
      async (item) => (await this.context.store.get('users', item.user_id))?.active,
    );
    const nomination = (await this.context.store.all('requests')).find(
      (request) => request.nomination?.release_id === releaseId && request.state === 'pending',
    );
    return {
      recommendation_count: recommendations.length,
      recommended: !!principal && recommendations.some((item) => item.user_id === principal.id),
      nomination: nomination
        ? { request_id: nomination.id, mine: nomination.submitted_by === principal?.id }
        : null,
    };
  }
  /**
   * 推荐是集合语义的开关：重复提交同值不产生新记录，天然幂等，故不经
   * `IdempotencyService`；整体在 `store.tx` 内执行，先校验版本可读（404）再增删记录。
   * 变更会写 `asset.recommended` / `asset.recommendation_removed` 审计，
   * 返回值与 {@link summary} 一致，便于前端就地刷新计数。
   */
  async rate(p: Principal, input: RecommendationCommand) {
    const b = input;
    return await this.context.store.tx(async () => {
      const current = await this.context.identity.principal(p.id);
      const version = await this.access.requireReadableVersion(current, b.version_id);
      const existing = (
        await this.context.store.where('recommendations', 'version_id', version.id)
      ).find((item) => item.user_id === current.id);
      if (b.recommended && !existing) {
        await this.context.store.insert('recommendations', {
          id: randomUUID(),
          user_id: current.id,
          version_id: version.id,
          created_at: new Date().toISOString(),
        });
        await this.context.store.audit(current.id, 'asset.recommended', version.id);
      } else if (!b.recommended && existing) {
        await this.context.store.remove('recommendations', existing.id);
        await this.context.store.audit(current.id, 'asset.recommendation_removed', version.id);
      }
      return await this.summary(
        version.id,
        (await this.access.latestReleaseForVersion(version)).id,
        current,
      );
    });
  }
}
