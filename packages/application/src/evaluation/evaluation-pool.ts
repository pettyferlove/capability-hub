import { canonical, digest, sha256 } from '@capability-hub/domain/canonical';
import type {
  PublicationRequestRecord,
  ReleaseRecord,
  ResourceEvaluationRecord,
  VersionRecord,
} from '@capability-hub/domain/models';
import type { CatalogService } from '../catalog/catalog-service.js';
import { normalizeText, segmentTerms } from '../catalog/search-terms.js';
import type { RecordStore } from '../ports/index.js';

const syntheticSet = '2026-11-24.1';
const synthetic = [
  {
    name: '[通用语句校对]',
    description: '检查给定文章的错别字、标点和语句通顺程度。',
    releaseId: null,
    version: null,
  },
  {
    name: '[日程时间换算]',
    description: '在已知时区之间换算会议日期和时间。',
    releaseId: null,
    version: null,
  },
];

function terms(values: string[]) {
  return segmentTerms(normalizeText(values.join(' ')));
}

function coversAudience(row: ResourceEvaluationRecord, release: ReleaseRecord) {
  return (
    release.distribution.mode === 'approved_audience' &&
    (release.distribution.audience.includes('public') ||
      (row.audience_class === 'signed_in' &&
        release.distribution.audience.includes('organization')))
  );
}

/** 当前发布和该版本最近的发布必须都属于目标受众等级，分组或个人授权不会扩大干扰项池。 */
export class EvaluationPool {
  constructor(
    private readonly store: RecordStore,
    private readonly catalog: CatalogService,
  ) {}

  private async eligible(row: ResourceEvaluationRecord) {
    return (await this.catalog.distributableEntries()).filter(
      (entry) =>
        entry.asset.kind === 'skill' &&
        entry.asset.id !== row.asset_id &&
        coversAudience(row, entry.release) &&
        coversAudience(row, entry.resolved),
    );
  }

  private async targetTerms(row: ResourceEvaluationRecord, version: VersionRecord) {
    const matches = (policy: Pick<ReleaseRecord, 'distribution' | 'requires_api_key'>) =>
      (policy.requires_api_key === true) === row.requires_api_key &&
      (policy.distribution.audience.includes('public') ? 'public' : 'signed_in') ===
        row.audience_class;
    let policy: PublicationRequestRecord | ReleaseRecord | undefined;
    if (row.trigger !== 'submission') {
      policy = (await this.store.where('releases', 'version_id', version.id))
        .filter((r) => r.published_at <= row.requested_at && matches(r))
        .sort((a, b) => b.release_seq - a.release_seq)[0];
    }
    policy ??= (await this.store.where('requests', 'version_id', version.id))
      .filter((r) => r.created_at <= row.requested_at && matches(r))
      .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id))[0];
    const intake = policy ? undefined : await this.store.get('intakes', version.intake_id);
    const keywords = policy
      ? (policy.applies_to.keywords ?? [])
      : (intake?.keywords ?? version.metadata.applies_to?.keywords ?? []);
    const scenarios = await Promise.all(
      (policy?.scenario_ids ?? []).map((id) => this.store.get('scenarios', id)),
    );
    const proposed =
      policy && 'proposed_scenarios' in policy ? (policy.proposed_scenarios ?? []) : [];
    return new Set(
      terms([
        version.metadata.name,
        version.metadata.description,
        ...keywords,
        ...scenarios.flatMap((s) => (s ? [s.name] : [])),
        ...proposed.map((s) => s.name),
      ]),
    );
  }

  async select(row: ResourceEvaluationRecord, version: VersionRecord) {
    return this.store.tx(async () => {
      const target = await this.targetTerms(row, version);
      const entries = await this.eligible(row);
      const ranked = entries.map(({ release, version: other, scenarios }) => {
        const words = terms([
          other.metadata.name,
          other.metadata.description,
          ...(release.applies_to.keywords ?? []),
          ...scenarios.map((s) => s.name),
        ]);
        return {
          id: release.id,
          overlap: words.filter((word) => target.has(word)).length,
          order: sha256(row.id + '|' + release.id),
        };
      });
      ranked.sort((a, b) => b.overlap - a.overlap || a.order.localeCompare(b.order));
      const near = ranked.slice(0, 4);
      const random = ranked
        .slice(4)
        .sort((a, b) => a.order.localeCompare(b.order))
        .slice(0, 3);
      return {
        pool_digest: digest(
          canonical(
            entries
              .map((entry) => [entry.release.id, ...entry.scenarios.map((s) => s.name)])
              .sort(([a], [b]) => a.localeCompare(b)),
          ),
        ),
        distractor_release_ids: [...near, ...random].map(({ id }) => id),
        synthetic_set: syntheticSet,
      };
    });
  }

  private async frozenVersion(row: ResourceEvaluationRecord, id: string) {
    const release = await this.store.get('releases', id);
    if (!release || release.asset_id === row.asset_id) return;
    const asset = await this.store.get('assets', release.asset_id);
    const version = await this.store.get('versions', release.version_id);
    if (
      asset?.kind !== 'skill' ||
      asset.lifecycle === 'blocked' ||
      version?.availability !== 'released'
    )
      return;
    const current = await this.store.get('releases', asset.current_release_id);
    const resolved = (await this.store.where('releases', 'version_id', version.id)).sort(
      (a, b) => b.release_seq - a.release_seq,
    )[0];
    if (!current || !resolved) return;
    const policies = [release, resolved, current];
    if (!policies.every((policy) => coversAudience(row, policy))) return;
    for (const sourceId of new Set(policies.map((policy) => policy.policy_source_id))) {
      const source = await this.store.get('sources', sourceId);
      if (!source || source.state === 'blocked' || source.distribution_revoked_at) return;
    }
    return version;
  }

  /** 后续发布可以继续授权历史版本；派发时只能采用冻结版本的描述。 */
  async choices(row: ResourceEvaluationRecord, version: VersionRecord) {
    const choices = [];
    for (const releaseId of row.context?.distractor_release_ids ?? []) {
      const frozen = await this.frozenVersion(row, releaseId);
      if (frozen)
        choices.push({
          name: frozen.metadata.name,
          description: frozen.metadata.description,
          releaseId,
          version: frozen,
        });
    }
    return [
      {
        name: version.metadata.name,
        description: version.metadata.description,
        releaseId: null,
        version,
      },
      ...choices,
      ...synthetic,
    ];
  }
}
