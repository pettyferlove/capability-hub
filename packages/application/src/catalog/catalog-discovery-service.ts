import type { Principal } from '@capability-hub/domain/identity';
import type { CatalogPromptBatch } from '@capability-hub/domain/models';
import { canonical, sha256 } from '@capability-hub/domain/canonical';
import type { ApplicationContext } from '../shared/application-context.js';
import type { AssetAccessService } from './asset-access-service.js';
import { scenariosOf, type CatalogEntry, type CatalogService } from './catalog-service.js';
import type { DiscoveryCandidate } from './discovery-evidence.js';

/** 记录一条文字来自哪个固定发布；复用前须确认该版本仍可读且最近发布未变。 */
export interface DiscoveryBasis {
  asset_id: string;
  version_id: string;
  release_id: string;
}

/** 后台分批用的候选；同一 `audienceSignature` 的发布才能进入同一批。 */
export interface PromptSourceCandidate extends DiscoveryCandidate {
  audienceSignature: string;
}

function entryCandidate(entry: CatalogEntry): DiscoveryCandidate {
  return {
    asset: entry.asset,
    version: entry.version,
    release: entry.release,
    resolvedReleaseId: entry.resolved.id,
    scenarios: entry.scenarios.filter((scenario) => scenario.name),
    tags: entry.tags,
    // 目录条目已排除封禁来源和非 approved_audience 模式，匿名可读只取决于两层受众都含 public。
    publicReadable: [entry.release, entry.resolved].every((release) =>
      release.distribution.audience.includes('public'),
    ),
  };
}

/**
 * 首页发现的目录读取。全部方法都假定调用方已打开 `store.tx`，让同一轮的候选、场景、
 * 固定版本和依据复核读到同一快照；缓存与可见性规则沿用 {@link CatalogService}。
 */
export class CatalogDiscoveryService {
  constructor(
    private readonly context: ApplicationContext,
    private readonly access: AssetAccessService,
    private readonly catalog: CatalogService,
  ) {}

  async candidates(p: Principal | null) {
    return (await this.catalog.visibleEntries(p)).map(entryCandidate);
  }

  async scenarios(p: Principal | null) {
    return (await this.catalog.visibleScenarios(p)).map(({ id, name }) => ({ id, name }));
  }

  /** 固定版本候选，可以是历史版本；不存在、资产不匹配或主体不可读一律返回 `undefined`。 */
  async version(
    p: Principal | null,
    assetId: string,
    versionId: string,
  ): Promise<DiscoveryCandidate | undefined> {
    const asset = await this.context.store.get('assets', assetId);
    const version = await this.context.store.get('versions', versionId);
    if (
      !asset ||
      !version ||
      version.asset_id !== asset.id ||
      !(await this.access.canRead(p, asset, version))
    )
      return;
    const resolved = await this.access.latestReleaseForVersion(version);
    const current = await this.context.store.get('releases', asset.current_release_id);
    const release = current?.version_id === version.id ? current : resolved;
    const scenarios = new Map(
      (await this.context.store.all('scenarios')).map((scenario) => [scenario.id, scenario]),
    );
    return {
      asset,
      version,
      release,
      resolvedReleaseId: resolved.id,
      scenarios: scenariosOf(release, scenarios).filter((scenario) => scenario.name),
      tags: Object.values(release.applies_to).flat().map(String),
      publicReadable: await this.access.canRead(null, asset, version),
    };
  }

  /** 依据仍成立：版本对主体可读，且最近一次发布仍是记录时那一次（受众或策略未被改写）。 */
  async basisValid(p: Principal | null, basis: DiscoveryBasis) {
    const candidate = await this.version(p, basis.asset_id, basis.version_id);
    return candidate?.resolvedReleaseId === basis.release_id;
  }

  /**
   * 整批复核：每个来源仍是资产的当前发布、同版最近发布未变且主体可读，任一不满足整批作废；
   * 不能只检查提供答案的那个版本。
   */
  async batchValid(p: Principal | null, batch: CatalogPromptBatch) {
    for (const source of batch.sources) {
      const asset = await this.context.store.get('assets', source.asset_id);
      const version = await this.context.store.get('versions', source.version_id);
      if (
        !asset ||
        !version ||
        version.asset_id !== asset.id ||
        asset.lifecycle !== 'active' ||
        asset.current_release_id !== source.release_id ||
        (await this.access.latestReleaseForVersion(version))?.id !== source.resolved_release_id ||
        !(await this.access.canRead(p, asset, version))
      )
        return false;
    }
    return true;
  }

  /** 全部可分发发布及其受众签名，签名覆盖当前发布与同版最近发布的受众。 */
  async promptSources(): Promise<PromptSourceCandidate[]> {
    return (await this.catalog.distributableEntries()).map((entry) => ({
      ...entryCandidate(entry),
      audienceSignature: sha256(
        canonical({
          current: [...entry.release.distribution.audience].sort(),
          resolved: [...entry.resolved.distribution.audience].sort(),
        }),
      ),
    }));
  }
}
