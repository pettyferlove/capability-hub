import type { Policy } from '@capability-hub/domain/policy';
import type { Principal } from '@capability-hub/domain/identity';
import type {
  AssetRecord,
  PublicationRequestRecord,
  ReleaseRecord,
  SourceRecord,
  VersionRecord,
} from '@capability-hub/domain/models';
import type { RecordStore } from '../ports/index.js';
import { someAsync } from '@capability-hub/domain/async';
import { fail, notFound } from '@capability-hub/domain/errors';
import { has } from '@capability-hub/domain/rbac';
import type { IdentityService } from '../identity/identity-service.js';

/** 维护、审查和分发权限独立判断；历史版本同时受当前发布与原发布受众约束。 */
export class AssetAccessService {
  constructor(
    private readonly store: RecordStore,
    private readonly identity: IdentityService,
  ) {}
  async getAsset(id: string) {
    const a = (await this.store.get('assets', id)) ?? (await this.store.find('assets', 'slug', id));
    if (!a) notFound();
    return a;
  }
  assetContext(a: AssetRecord) {
    return { team: a.owner_group_id, source: a.source_id, asset: a.id };
  }
  canMaintain(principal: Principal, asset: AssetRecord) {
    return has(principal, 'asset:maintain', this.assetContext(asset));
  }
  requireMaintenance(principal: Principal, asset: AssetRecord) {
    if (!this.canMaintain(principal, asset)) fail(403, 'FORBIDDEN', '无资产维护权限');
  }
  requireSourceManagement(principal: Principal, s: SourceRecord) {
    this.identity.require(principal, 'source:manage', { team: s.owner_group_id, source: s.id });
  }
  async canReview(principal: Principal, request: PublicationRequestRecord) {
    const a = await this.getAsset(request.asset_id);
    if (
      request.category === 'general' ||
      request.distribution.audience.includes('public') ||
      request.distribution.audience.includes('organization') ||
      request.distribution.audience.some((id: string) => id !== `group:${a.owner_group_id}`)
    )
      return has(principal, 'review:decide');
    if (request.category === 'scenario')
      return (
        has(principal, 'review:decide') ||
        request.scenario_ids.every((id: string) =>
          has(principal, 'review:decide', { scenario: id }),
        )
      );
    return has(principal, 'review:decide', { team: a.owner_group_id });
  }
  async requireCandidateAccess(principal: Principal, version: VersionRecord) {
    const a = await this.getAsset(version.asset_id);
    if (
      !this.canMaintain(principal, a) &&
      !(await someAsync(
        await this.store.all('requests'),
        async (r) =>
          r.asset_id === a.id &&
          r.version_id === version.id &&
          (await this.canReview(principal, r)),
      ))
    )
      fail(403, 'FORBIDDEN', '无候选内容审查权限');
    await this.store.audit(principal.id, 'content.management_read', version.id);
  }
  async matchesAudience(p: Principal | null, release: ReleaseRecord) {
    if (release.distribution.mode !== 'approved_audience') return false;
    const s = await this.store.get('sources', release.policy_source_id);
    if (!s || s.state === 'blocked' || s.distribution_revoked_at) return false;
    if (release.distribution.audience.includes('public')) return true;
    if (!p?.active) return false;
    return release.distribution.audience.some(
      (id: string) =>
        id === 'organization' ||
        id === `principal:${p.id}` ||
        p.groups.some((g) => id === `group:${g}`),
    );
  }
  async latestReleaseForVersion(version: VersionRecord) {
    return (await this.store.where('releases', 'version_id', version.id)).sort(
      (a, b) => b.release_seq - a.release_seq,
    )[0];
  }
  async canRead(p: Principal | null, asset: AssetRecord, version: VersionRecord) {
    if ((p && !p.active) || asset.lifecycle === 'blocked' || version.availability !== 'released')
      return false;
    const current = await this.store.get('releases', asset.current_release_id ?? '');
    const resolved = await this.latestReleaseForVersion(version);
    return (
      !!current &&
      !!resolved &&
      (await this.matchesAudience(p, current)) &&
      (await this.matchesAudience(p, resolved))
    );
  }
  async requireReadableVersion(p: Principal | null, id: string) {
    const v = await this.store.get('versions', id);
    if (!v || !(await this.canRead(p, await this.getAsset(v.asset_id), v))) notFound();
    return v;
  }
  async requirePublicVersion(kind: 'skill' | 'mcp', slug: string, label: string) {
    const asset = await this.store.find('assets', 'slug', slug);
    if (!asset || asset.kind !== kind) notFound();
    const version = (await this.store.where('versions', 'asset_id', asset.id)).find(
      (version) => version.version_label === label,
    );
    if (!version) notFound();
    return await this.requireReadableVersion(null, version.id);
  }
  async formatVisibility(distribution: Policy['distribution']) {
    return (
      await Promise.all(
        distribution.audience.map(async (id: string) => {
          if (id === 'public') return '公开';
          if (id === 'organization') return '登录用户';
          const [kind, value] = id.split(':');
          return (
            (kind === 'group'
              ? (await this.store.get('groups', value))?.name
              : (await this.store.get('users', value))?.display_name) ?? '已移除受众'
          );
        }),
      )
    ).join('、');
  }
  async requirePublishedAsset(principal: Principal | null, id: string) {
    const asset = await this.getAsset(id);
    const release = await this.store.get('releases', asset.current_release_id);
    if (!release) notFound();
    const version = await this.requireReadableVersion(principal, release.version_id);
    return { asset, release, version };
  }
  async canViewCatalog(principal: Principal, asset: AssetRecord) {
    const release = await this.store.get('releases', asset.current_release_id);
    const version = release && (await this.store.get('versions', release.version_id));
    return !!version && (await this.canRead(principal, asset, version));
  }
}
