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
  /**
   * 兼容内部 id 与对外 slug 两种寻址，使公开链接与后台入口共用同一定位逻辑；
   * 不存在时抛 404/`NOT_FOUND`。
   */
  async getAsset(id: string) {
    const a = (await this.store.get('assets', id)) ?? (await this.store.find('assets', 'slug', id));
    if (!a) notFound();
    return a;
  }
  /**
   * RBAC 判定作用域的唯一来源：只含所属团队、来源与资产三个维度，
   * 调用方不应自行拼装作用域，否则权限名与作用域组合会漂移。
   */
  assetContext(a: AssetRecord) {
    return { team: a.owner_group_id, source: a.source_id, asset: a.id };
  }
  /** 非抛出版本，供呈现层决定是否显示管理入口；写操作必须改用 {@link requireMaintenance}。 */
  canMaintain(principal: Principal, asset: AssetRecord) {
    return has(principal, 'asset:maintain', this.assetContext(asset));
  }
  /** 要求 `asset:maintain`，作用域取自资产的团队/来源，不满足抛 403/`FORBIDDEN`。 */
  requireMaintenance(principal: Principal, asset: AssetRecord) {
    if (!this.canMaintain(principal, asset)) fail(403, 'FORBIDDEN', '无资产维护权限');
  }
  /** 要求 `source:manage`（作用域 `{ team, source }`），与资产维护权限互不替代；不满足抛 403。 */
  requireSourceManagement(principal: Principal, s: SourceRecord) {
    this.identity.require(principal, 'source:manage', { team: s.owner_group_id, source: s.id });
  }
  /**
   * 审查权限的作用域随请求范围扩大：通用类别、含公开/组织受众或跨组受众时要求全局
   * `review:decide`；场景类别要求覆盖全部 `scenario_ids`；其余仅限资产所属团队。
   */
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
  /**
   * 候选内容只对维护者或该版本待审请求的审查者可见，否则抛 403/`FORBIDDEN`；
   * 通过后每次调用都会写 `content.management_read` 审计，故不能当作无副作用的探测接口。
   */
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
  /**
   * 仅 `approved_audience` 模式需要匹配；来源被屏蔽或分发已被撤销时一律不匹配，
   * `public` 无需身份，`organization`/`principal:`/`group:` 前缀分别对应登录态与成员归属。
   */
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
  /** 取该版本 `release_seq` 最大的发布；版本从未发布时返回 `undefined`，调用方须自行判空。 */
  async latestReleaseForVersion(version: VersionRecord) {
    return (await this.store.where('releases', 'version_id', version.id)).sort(
      (a, b) => b.release_seq - a.release_seq,
    )[0];
  }
  /**
   * 读权限同时受当前发布与该版本原发布受众约束，任何一侧失效即不可读；
   * 停用账户、资产 `blocked`、版本非 `released` 直接拒绝，不写审计。
   */
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
  /** 版本不存在与不可读统一抛 404/`NOT_FOUND`，避免泄露未发布版本的存在性。 */
  async requireReadableVersion(p: Principal | null, id: string) {
    const v = await this.store.get('versions', id);
    if (!v || !(await this.canRead(p, await this.getAsset(v.asset_id), v))) notFound();
    return v;
  }
  /**
   * 公开路由的寻址方式：以 slug 定位资产并以 `version_label` 定位版本，
   * 再按匿名受众校验，任一步不匹配抛 404，不区分「不存在」与「无权」。
   */
  async requirePublicVersion(kind: 'skill' | 'mcp', slug: string, label: string) {
    const asset = await this.store.find('assets', 'slug', slug);
    if (!asset || asset.kind !== kind) notFound();
    const version = (await this.store.where('versions', 'asset_id', asset.id)).find(
      (version) => version.version_label === label,
    );
    if (!version) notFound();
    return await this.requireReadableVersion(null, version.id);
  }
  /**
   * 面向界面的受众文案，已删除的受众回落为「已移除受众」而不报错，
   * 因此该结果只用于展示，不能反向作为权限判定依据。
   */
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
  /** 一次性解析「资产 + 当前发布 + 可读版本」三元组；缺发布或版本不可读均抛 404。 */
  async requirePublishedAsset(principal: Principal | null, id: string) {
    const asset = await this.getAsset(id);
    const release = await this.store.get('releases', asset.current_release_id);
    if (!release) notFound();
    const version = await this.requireReadableVersion(principal, release.version_id);
    return { asset, release, version };
  }
  /** 目录列表的过滤谓词：无当前发布或不可读即隐藏；非抛出，不要用于写路径授权。 */
  async canViewCatalog(principal: Principal, asset: AssetRecord) {
    const release = await this.store.get('releases', asset.current_release_id);
    const version = release && (await this.store.get('versions', release.version_id));
    return !!version && (await this.canRead(principal, asset, version));
  }
}
