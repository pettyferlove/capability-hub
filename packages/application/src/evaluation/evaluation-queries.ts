import { someAsync } from '@capability-hub/domain/async';
import { canonical, digest } from '@capability-hub/domain/canonical';
import { fail, notFound } from '@capability-hub/domain/errors';
import {
  evaluationBand,
  evaluationRubric,
  evaluationRubricVersion,
  publicEvaluationMetrics,
} from '@capability-hub/domain/evaluation';
import { has, hasInAnyScope } from '@capability-hub/domain/rbac';
import type { Principal } from '@capability-hub/domain/identity';
import type {
  AssetRecord,
  EvaluationDimensionResult,
  PublicationRequestRecord,
  ReleaseRecord,
  ResourceEvaluationRecord,
  VersionRecord,
} from '@capability-hub/domain/models';
import type { AssetAccessService } from '../catalog/asset-access-service.js';
import type { RecordStore } from '../ports/index.js';
import type { EvaluationService } from './evaluation-service.js';
import { dayMs, utcWindow } from './evaluation-stages.js';

type Evaluation = ResourceEvaluationRecord;
type Declaration = Pick<PublicationRequestRecord, 'distribution' | 'requires_api_key'>;
type VersionResult = { row: Evaluation; version: VersionRecord };

type Comparison = { status: 'none' | 'available' | 'incomparable'; result: VersionResult | null };

function finished(row: Evaluation) {
  return row.state === 'succeeded' || row.state === 'partial';
}

function active(row: Evaluation) {
  return row.state === 'queued' || row.state === 'running';
}

function latest(rows: Evaluation[]) {
  const current = rows.filter((row) => row.rubric_version === evaluationRubricVersion);
  const eligible = current.length ? current : rows;
  return eligible.find((row) => row.scope === 'full') ?? eligible[0];
}

function publicDimension(dim: EvaluationDimensionResult) {
  const rubric = evaluationRubric[dim.id];
  const checks = rubric.checks.flatMap(({ id, label }) => {
    const check = dim.checks.find((row) => row.id === id);
    return check ? [{ id, label, verdict: check.verdict }] : [];
  });
  return {
    id: dim.id,
    label: rubric.label,
    status: dim.status,
    score: dim.score,
    band: evaluationBand(dim.score),
    confidence: dim.confidence,
    checks,
    ...(dim.metrics && {
      metrics: Object.fromEntries(
        Object.entries(dim.metrics).filter(([key]) => publicEvaluationMetrics.has(key)),
      ),
    }),
    ...(dim.flags && { flags: dim.flags }),
  };
}

function summary(row: Evaluation, version: VersionRecord) {
  return {
    id: row.id,
    version_id: version.id,
    version_label: version.version_label,
    rubric_version: row.rubric_version,
    scan_ruleset: row.scan_ruleset,
    comparable_key: digest(canonical([row.rubric_version, row.evaluator_digest])),
    state: row.state,
    evaluated_at: row.finished_at ?? null,
    limitations: [
      ...(row.scope === 'static' ? (['static_only'] as const) : []),
      ...(row.stages.some((stage) => stage.id === 'task-cases')
        ? (['paper_run_only'] as const)
        : []),
      ...(row.stages.some((stage) => stage.id === 'trigger-routing')
        ? (['client_routing_may_differ'] as const)
        : []),
      'scripts_not_executed' as const,
    ],
  };
}

function detail(
  { row, version }: VersionResult,
  names: ReadonlyMap<string, string>,
  reusedFrom: string | null,
) {
  const stages =
    row.reused_from && !reusedFrom
      ? row.stages.map(({ execution_id: _executionId, ...stage }) => stage)
      : row.stages;
  return {
    ...row,
    ...summary(row, version),
    reused_from: reusedFrom,
    stages,
    context: row.context && {
      ...row.context,
      distractor_release_ids: row.context.distractor_release_ids.filter((id) => names.has(id)),
    },
    confusions: row.confusions?.map(({ case_id, release_id }) => ({
      case_id,
      name: names.get(release_id) ?? '另一项资源',
    })),
    dimensions: row.dimensions.map((dim) => {
      const rubric = evaluationRubric[dim.id];
      return {
        ...dim,
        label: rubric.label,
        band: evaluationBand(dim.score),
        checks: dim.checks.map((item) => {
          const criterion = rubric.checks.find((c) => c.id === item.id);
          return { ...item, label: criterion?.label ?? item.id, weight: criterion?.weight ?? 0 };
        }),
      };
    }),
  };
}

function regressions(
  candidate: ReturnType<typeof detail> | null,
  current: ReturnType<typeof detail> | null,
) {
  if (
    !candidate ||
    !current ||
    candidate.rubric_version !== evaluationRubricVersion ||
    candidate.comparable_key !== current.comparable_key
  )
    return [];
  const eligible = (dim: EvaluationDimensionResult) =>
    dim.confidence === 'medium' || dim.confidence === 'high';
  return candidate.dimensions.flatMap((dim) => {
    const prior = current.dimensions.find((value) => value.id === dim.id);
    if (!prior || !eligible(prior) || !eligible(dim) || prior.score === null || dim.score === null)
      return [];
    const drop = prior.score - dim.score;
    return drop >= 10
      ? [{ id: dim.id, label: dim.label, previous: prior.score, score: dim.score, drop }]
      : [];
  });
}

function detailKey(row: ReturnType<typeof detail> | null) {
  return (
    row && [
      row.id,
      row.revision,
      row.reused_from,
      row.context?.distractor_release_ids ?? [],
      row.confusions ?? [],
    ]
  );
}

/** 公开读取按发布受众授权，审核读取以对应申请的候选和冻结基线为限。 */
export class EvaluationQueries {
  constructor(
    private readonly store: RecordStore,
    private readonly access: AssetAccessService,
    private readonly evaluations: EvaluationService,
  ) {}

  private async matching(version: VersionRecord, policy: Declaration) {
    const audience = policy.distribution.audience.includes('public') ? 'public' : 'signed_in';
    return (await this.store.listVersionEvaluations(version.id)).filter(
      (row) =>
        row.content_digest === version.content_digest &&
        (row.scope === 'static' ||
          (row.evaluator_digest !== null &&
            row.requires_api_key === (policy.requires_api_key === true) &&
            row.audience_class === audience)),
    );
  }

  private async canViewDetails(
    principal: Principal | null,
    asset: AssetRecord,
    version: VersionRecord,
  ) {
    if (!principal) return false;
    if (this.access.canMaintain(principal, asset)) return true;
    if (!hasInAnyScope(principal, 'review:decide')) return false;
    return someAsync(await this.store.where('requests', 'version_id', version.id), (request) =>
      this.access.canReview(principal, request),
    );
  }

  private async controls(
    principal: Principal | null,
    asset: AssetRecord,
    version: VersionRecord,
    waiting: Evaluation[] = [],
  ) {
    const evaluator = this.evaluations.evaluatorDigest;
    const permitted =
      !!principal &&
      this.access.canMaintain(principal, asset) &&
      has(principal, 'ai:execute', this.access.assetContext(asset)) &&
      asset.kind === 'skill' &&
      asset.lifecycle !== 'blocked' &&
      version.availability !== 'revoked';
    const inFlight = evaluator
      ? waiting.filter(
          (row) =>
            active(row) &&
            row.rubric_version === evaluationRubricVersion &&
            row.evaluator_digest === evaluator &&
            row.scope === 'full',
        )
      : [];
    const queued = inFlight.some((row) => row.state === 'queued');
    const window =
      evaluator && (permitted || queued)
        ? await this.evaluations.admissionWindow(evaluator)
        : 'unavailable';
    const next = utcWindow() + dayMs;
    let delayed = queued && window === 'next_window';
    if (!delayed) {
      for (const row of inFlight) {
        if (!row.active_job_id) continue;
        const job = await this.store.get('jobs', row.active_job_id);
        if (
          job?.kind === 'resource_evaluation' &&
          job.state === 'queued' &&
          job.input.stage !== 'static' &&
          job.run_after === next
        ) {
          delayed = true;
          break;
        }
      }
    }
    return {
      current_rubric_version: evaluationRubricVersion,
      model_enabled: !!evaluator,
      can_request:
        permitted && window === 'available' && (await this.evaluations.hasManualQuota(asset.id)),
      next_window_at: delayed ? new Date(next).toISOString() : null,
    };
  }

  private async baseline(
    principal: Principal | null,
    asset: AssetRecord,
    release: ReleaseRecord,
    row: Evaluation,
  ): Promise<Comparison> {
    const previous = (await this.store.where('releases', 'asset_id', asset.id))
      .filter((r) => r.release_seq < release.release_seq)
      .sort((a, b) => b.release_seq - a.release_seq)[0];
    const absent = { status: 'none', result: null } as const;
    if (!previous || !(await this.access.matchesAudience(principal, previous))) return absent;
    const version = await this.store.get('versions', previous.version_id);
    if (!version || !(await this.access.canRead(principal, asset, version))) return absent;
    const candidates = (await this.matching(version, previous)).filter(finished);
    const prior =
      row.rubric_version === evaluationRubricVersion &&
      candidates.find(
        (r) =>
          r.rubric_version === row.rubric_version && r.evaluator_digest === row.evaluator_digest,
      );
    if (prior) return { status: 'available', result: { row: prior, version } };
    return { status: candidates.length ? 'incomparable' : 'none', result: null };
  }

  async published(
    principal: Principal | null,
    assetId: string,
    versionId: string,
    webSession: boolean,
  ) {
    return this.store.tx(async () => {
      const asset = await this.access.getAsset(assetId);
      const version = await this.access.requireReadableVersion(principal, versionId);
      if (version.asset_id !== asset.id) notFound();
      const release = await this.access.latestReleaseForVersion(version);
      const rows = await this.matching(version, release);
      const row = latest(rows.filter(finished));
      const comparison = row ? await this.baseline(principal, asset, release, row) : null;
      const prior = comparison?.result;
      const operator = webSession ? principal : null;
      const authorized = await this.canViewDetails(operator, asset, version);
      const evaluator = this.evaluations.evaluatorDigest;
      const attempt = latest(
        rows.filter(
          (r) =>
            r.rubric_version === evaluationRubricVersion &&
            (r.scope === 'full'
              ? r.evaluator_digest === evaluator
              : !row || row.rubric_version !== evaluationRubricVersion || row.scope === 'static'),
        ),
      );
      const { current_rubric_version, can_request, next_window_at } = await this.controls(
        operator,
        asset,
        version,
        authorized && attempt ? [attempt] : [],
      );
      const state = {
        current_rubric_version,
        can_request,
        can_view_details: authorized,
        updating: (!!row || authorized) && !!attempt && active(attempt),
        ...(authorized && attempt && !finished(attempt) && { latest_attempt_id: attempt.id }),
        ...(next_window_at && { next_window_at }),
        comparison_status: comparison?.status ?? 'none',
      };
      return {
        revisionKey: digest(
          canonical([
            state,
            row?.id ?? null,
            row?.revision ?? null,
            prior?.row.id ?? null,
            prior?.row.revision ?? null,
          ]),
        ),
        body: {
          ...state,
          evaluation: row
            ? { ...summary(row, version), dimensions: row.dimensions.map(publicDimension) }
            : null,
          baseline: prior
            ? {
                version_label: prior.version.version_label,
                dimensions: prior.row.dimensions.map(({ id, score }) => ({ id, score })),
              }
            : null,
        },
      };
    });
  }

  private async describe(principal: Principal, results: VersionResult[]) {
    const versions = new Set(results.map(({ version }) => version.id));
    const sourceIds = new Set<string>();
    const releaseIds = new Set<string>();
    for (const { row } of results) {
      if (row.reused_from) sourceIds.add(row.reused_from);
      for (const id of row.context?.distractor_release_ids ?? []) releaseIds.add(id);
      for (const item of row.confusions ?? []) releaseIds.add(item.release_id);
    }
    const names = new Map<string, string>();
    for (const id of releaseIds) {
      const release = await this.store.get('releases', id);
      if (!release || !(await this.access.matchesAudience(principal, release))) continue;
      const asset = await this.store.get('assets', release.asset_id);
      const version = await this.store.get('versions', release.version_id);
      if (asset && version && (await this.access.canRead(principal, asset, version)))
        names.set(id, asset.slug);
    }
    const visibleSources = new Set<string>();
    for (const id of sourceIds) {
      const source = await this.store.get('resource_evaluations', id);
      if (!source) continue;
      const asset = await this.store.get('assets', source.asset_id);
      if (versions.has(source.version_id) || (asset && this.access.canMaintain(principal, asset)))
        visibleSources.add(id);
    }
    return results.map((result) => {
      const source = result.row.reused_from;
      return detail(result, names, source && visibleSources.has(source) ? source : null);
    });
  }

  async review(principal: Principal, id: string) {
    return this.store.tx(async () => {
      const request = await this.store.get('requests', id);
      if (!request) notFound();
      const asset = await this.access.getAsset(request.asset_id);
      const maintains = this.access.canMaintain(principal, asset);
      if (!maintains && !(await this.access.canReview(principal, request)))
        fail(403, 'FORBIDDEN', '无对应申请审核权限');
      const version = await this.store.get('versions', request.version_id);
      if (!version) notFound();
      if (!maintains && version.availability !== 'unreleased')
        await this.access.requireReadableVersion(principal, version.id);
      const rows = await this.matching(version, request);
      const candidateRow = latest(rows);
      const state = await this.controls(
        principal,
        asset,
        version,
        candidateRow ? [candidateRow] : [],
      );
      const results: VersionResult[] = [];
      if (candidateRow) results.push({ row: candidateRow, version });

      // 与变更审查共用申请提交时的发布基线，审批结束后也不借旧申请读后续版本。
      const release = await this.store.get('releases', request.base_release_id);
      if (release && release.asset_id === asset.id) {
        const prior = await this.store.get('versions', release.version_id);
        if (
          prior &&
          (maintains ||
            ((await this.access.matchesAudience(principal, release)) &&
              (await this.access.canRead(principal, asset, prior))))
        ) {
          const row = latest((await this.matching(prior, release)).filter(finished));
          if (row) results.push({ row, version: prior });
        }
      }
      const views = await this.describe(principal, results);
      const candidate = candidateRow ? views[0] : null;
      const current = views[candidateRow ? 1 : 0] ?? null;
      return {
        revisionKey: digest(canonical([state, detailKey(candidate), detailKey(current)])),
        body: { ...state, candidate, current, regressions: regressions(candidate, current) },
      };
    });
  }

  async history(principal: Principal, versionId: string) {
    return this.store.tx(async () => {
      const version = await this.store.get('versions', versionId);
      if (!version) notFound();
      const asset = await this.access.getAsset(version.asset_id);
      if (!this.access.canMaintain(principal, asset)) {
        if (!(await this.canViewDetails(principal, asset, version)))
          fail(403, 'FORBIDDEN', '无候选内容审查权限');
        if (version.availability !== 'unreleased')
          await this.access.requireReadableVersion(principal, version.id);
      }
      const rows = await this.store.listVersionEvaluations(version.id);
      const items = await this.describe(
        principal,
        rows.map((row) => ({ row, version })),
      );
      const state = await this.controls(principal, asset, version, rows);
      return {
        revisionKey: digest(canonical([state, items.map(detailKey)])),
        body: { ...state, items },
      };
    });
  }
}
