import type { Principal } from '@capability-hub/domain/identity';
import type { RecommendationCommand } from './commands.js';
import { filterAsync } from '@capability-hub/domain/async';
import { randomUUID } from 'node:crypto';
import type { ApplicationContext } from '../shared/application-context.js';
import type { AssetAccessService } from './asset-access-service.js';

export class AssetCommunityService {
  constructor(
    private readonly context: ApplicationContext,
    private readonly access: AssetAccessService,
  ) {}
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
