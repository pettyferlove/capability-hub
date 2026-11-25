import { randomUUID } from 'node:crypto';
import { canonical, digest } from '@capability-hub/domain/canonical';
import {
  evaluationRubricVersion,
  evaluationStageRequests,
  pendingDimensions,
} from '@capability-hub/domain/evaluation';
import { fail, notFound } from '@capability-hub/domain/errors';
import type { Principal } from '@capability-hub/domain/identity';
import type {
  JobRecord,
  PublicationRequestRecord,
  ResourceEvaluationRecord,
  VersionRecord,
} from '@capability-hub/domain/models';
import { has } from '@capability-hub/domain/rbac';
import type { AssetAccessService } from '../catalog/asset-access-service.js';
import type { JobQueue } from '../jobs/job-queue.js';
import type { RecordStore } from '../ports/index.js';
import type { IdempotencyService } from '../shared/idempotency-service.js';
import {
  dayMs,
  EvaluationStages,
  pendingCalls,
  stageDimension,
  utcWindow,
  type EvaluationModel,
  type EvaluationSettings,
} from './evaluation-stages.js';
import type { EvaluationQueueCursor } from '../ports/record-store.js';

type Evaluation = ResourceEvaluationRecord;
type Trigger = Evaluation['trigger'];
type Declaration = Pick<PublicationRequestRecord, 'requires_api_key' | 'distribution'>;
const priority = { intake_ready: 0, submission: 100, manual: 80, release: 60, backfill: 20 };
const fullCost = Object.values(evaluationStageRequests).reduce<number>((sum, n) => sum + n, 0);

function committedCalls(row: Evaluation, job?: JobRecord) {
  return row.scope === 'full' && (!job || job.run_after <= Date.now()) ? pendingCalls(row, job) : 0;
}

function reuseResult(row: Evaluation, source: Evaluation): Evaluation {
  const evidence = {
    ...row,
    reused_from: source.id,
    context: source.context,
    cases: source.cases,
    confusions: source.confusions,
  };
  if (source.state === 'succeeded')
    return {
      ...evidence,
      scan_ruleset: source.scan_ruleset,
      state: 'succeeded',
      stages: source.stages,
      dimensions: source.dimensions,
      finished_at: new Date().toISOString(),
    };
  const failed = new Set(
    source.stages.filter((s) => s.state === 'failed').map((s) => stageDimension(s.id)),
  );
  const completed = new Map(
    source.stages
      .filter(
        (s) =>
          s.state === 'succeeded' || (s.state === 'skipped' && !failed.has(stageDimension(s.id))),
      )
      .map((s) => [s.id, s]),
  );
  return {
    ...evidence,
    // 扫描规则版本描述边界透明读取的扫描提示，复制该阶段时随原证据保留。
    scan_ruleset: completed.has('transparency') ? source.scan_ruleset : row.scan_ruleset,
    stages: row.stages.map(
      (stage) => completed.get(stage.id) ?? { id: stage.id, state: 'pending' },
    ),
    dimensions: pendingDimensions().map(
      (dim) =>
        source.dimensions.find(
          (d) => d.id === dim.id && !failed.has(d.id) && d.status !== 'failed',
        ) ?? dim,
    ),
  };
}

function copyStructure(row: Evaluation, history: Evaluation[]) {
  if (row.stages.some((stage) => stage.id === 'static' && stage.state === 'succeeded')) return row;
  const source = history.find(
    (other) =>
      other.content_digest === row.content_digest &&
      other.rubric_version === row.rubric_version &&
      other.stages.some((s) => s.id === 'static' && s.state === 'succeeded'),
  );
  if (!source) return row;
  return {
    ...row,
    reused_from: row.reused_from ?? source.id,
    stages: row.stages.map((stage) =>
      stage.id === 'static' ? source.stages.find((s) => s.id === 'static')! : stage,
    ),
    dimensions: row.dimensions.map((dim) =>
      dim.id === 'structure' ? source.dimensions.find((d) => d.id === 'structure')! : dim,
    ),
  };
}

/** 系统触发只登记冻结输入。相同评测共享结果，手动请求额外验证当前资产范围和日次数。 */
export class EvaluationService {
  readonly stages: EvaluationStages;
  private nextBackfillCheck = 0;
  private queueCursor?: EvaluationQueueCursor;
  constructor(
    private readonly store: RecordStore,
    jobs: JobQueue,
    private readonly settings: EvaluationSettings,
    private readonly model: EvaluationModel,
    private readonly access: AssetAccessService,
    private readonly idempotency: IdempotencyService,
  ) {
    this.stages = new EvaluationStages(store, jobs, settings, model);
  }

  get evaluatorDigest() {
    return this.model()?.digest ?? null;
  }

  async hasManualQuota(assetId: string) {
    return (
      (await this.store.countManualEvaluations(assetId, new Date(utcWindow()).toISOString())) < 3
    );
  }

  /**
   * 手动请求实际需要的模型调用数，与登记时的复用规则一致：已成功的同主体评测不再出站，
   * 运行中的调用已计入当日预算，排队中的评测与可沿用的部分结果只计未完成阶段。
   */
  async manualCost(version: VersionRecord, frozen?: Declaration) {
    const evaluator = this.model();
    if (!evaluator) return fullCost;
    const subject = digest(
      canonical({
        content_digest: version.content_digest,
        ...(await this.declaration(version, frozen)),
      }),
    );
    const existing = (await this.store.listVersionEvaluations(version.id)).find(
      (row) =>
        row.subject_digest === subject &&
        row.rubric_version === evaluationRubricVersion &&
        row.evaluator_digest === evaluator.digest &&
        ['queued', 'running', 'succeeded'].includes(row.state),
    );
    if (existing) return existing.state === 'queued' ? pendingCalls(existing) : 0;
    const source = await this.store.reusableEvaluation(
      subject,
      evaluationRubricVersion,
      evaluator.digest,
    );
    if (!source) return fullCost;
    if (source.state === 'succeeded') return 0;
    const stages = Object.keys(evaluationStageRequests).map((id) => ({
      id,
      state: 'pending' as const,
    }));
    return pendingCalls(reuseResult({ ...source, stages }, source));
  }

  /** 准入按本次请求实际待补的调用数计算，运行中已占用的当日预算不能再次承诺。 */
  async admissionWindow(
    evaluator: string,
    cost = fullCost,
  ): Promise<'available' | 'next_window' | 'unavailable'> {
    if (this.settings.evaluationDailyRequests < cost) return 'unavailable';
    let budget = await this.stages.remaining();
    if (budget < cost) return 'next_window';
    for (const row of await this.store.listRunningEvaluations()) {
      if (row.evaluator_digest !== evaluator || (await this.stages.unavailable(row))) continue;
      budget -= committedCalls(row, await this.store.get('jobs', row.active_job_id));
      if (budget < cost) return 'next_window';
    }
    return 'available';
  }

  async request(versionId: string, scanRuleset: string) {
    return (
      (await this.store.tx(() => this.register(versionId, 'intake_ready', scanRuleset)))?.row ??
      null
    );
  }

  async requestPublication(trigger: 'submission' | 'release', request: PublicationRequestRecord) {
    await this.store.tx(() =>
      this.register(request.version_id, trigger, request.ruleset_version, request),
    );
  }

  private async declaration(version: VersionRecord, frozen?: Declaration) {
    const latest =
      frozen ??
      (version.availability === 'released'
        ? await this.access.latestReleaseForVersion(version)
        : (await this.store.where('requests', 'version_id', version.id)).sort(
            (a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id),
          )[0]);
    const intake = latest ? undefined : await this.store.get('intakes', version.intake_id);
    const asset =
      latest || intake?.requires_api_key !== undefined
        ? undefined
        : await this.store.get('assets', version.asset_id);
    return {
      requires_api_key: latest
        ? latest.requires_api_key === true
        : (intake?.requires_api_key ?? asset?.requires_api_key === true),
      audience_class: latest?.distribution.audience.includes('public')
        ? ('public' as const)
        : ('signed_in' as const),
    };
  }

  private async register(
    versionId: string,
    trigger: Trigger,
    scanRuleset: string | null,
    frozen?: Declaration,
    actor?: string,
  ) {
    const version = await this.store.get('versions', versionId);
    if (!version) notFound();
    if (version.manifest.kind !== 'skill') return null;
    const evaluator = trigger === 'intake_ready' ? null : this.model();
    const inputs = evaluator
      ? await this.declaration(version, frozen)
      : { requires_api_key: null, audience_class: null };
    const subject = digest(canonical({ content_digest: version.content_digest, ...inputs }));
    const evaluatorDigest = evaluator?.digest ?? null;
    const history = await this.store.listVersionEvaluations(versionId);
    const matches = history.filter(
      (row) =>
        row.subject_digest === subject &&
        row.rubric_version === evaluationRubricVersion &&
        row.evaluator_digest === evaluatorDigest,
    );
    const existing = matches.find(
      (row) =>
        row.state === 'queued' ||
        row.state === 'running' ||
        row.state === 'succeeded' ||
        (row.state === 'partial' && trigger !== 'manual'),
    );
    if (existing) {
      const row =
        (existing.state === 'queued' || existing.state === 'running') &&
        priority[trigger] > existing.priority
          ? await this.store.put('resource_evaluations', {
              ...existing,
              priority: priority[trigger],
              revision: existing.revision + 1,
            })
          : existing;
      return { row, reused: true };
    }
    const source = await this.store.reusableEvaluation(
      subject,
      evaluationRubricVersion,
      evaluatorDigest,
    );
    const now = new Date().toISOString();
    let row: Evaluation = {
      id: randomUUID(),
      version_id: version.id,
      asset_id: version.asset_id,
      content_digest: version.content_digest,
      trigger,
      scope: evaluator ? 'full' : 'static',
      priority: priority[trigger],
      requested_by: actor ?? null,
      rubric_version: evaluationRubricVersion,
      evaluator_digest: evaluatorDigest,
      subject_digest: subject,
      ...inputs,
      scan_ruleset:
        scanRuleset ??
        (await this.store.where('scans', 'version_id', version.id))
          .filter((scan) => scan.state === 'passed')
          .sort((a, b) => b.finished_at.localeCompare(a.finished_at) || b.id.localeCompare(a.id))[0]
          ?.ruleset_version ??
        null,
      context: null,
      cases: null,
      active_job_id: null,
      recovery_requests: 0,
      requested_at: now,
      revision: 1,
      reused_from: null,
      dimensions: pendingDimensions(),
      stages: (evaluator ? Object.keys(evaluationStageRequests) : ['static']).map((id) => ({
        id,
        state: 'pending',
      })),
      state: 'queued',
    };
    if (source) row = reuseResult(row, source);
    if (row.state === 'queued') {
      row = copyStructure(row, history);
      if (row.stages.every((stage) => stage.state === 'succeeded'))
        row = { ...row, state: 'succeeded', finished_at: now };
    }
    await this.store.insert('resource_evaluations', row);
    return { row, reused: row.state === 'succeeded' };
  }

  async manual(
    principal: Principal,
    versionId: string,
    key: string | undefined,
    publicationRequestId?: string,
  ) {
    return this.store.tx(async () => {
      const version = await this.store.get('versions', versionId);
      if (!version) notFound();
      const asset = await this.access.getAsset(version.asset_id);
      this.access.requireMaintenance(principal, asset);
      if (!has(principal, 'ai:execute', this.access.assetContext(asset)))
        fail(403, 'FORBIDDEN', '需要目标资产的 AI 执行权限');
      if (asset.kind !== 'skill') fail(422, 'EVALUATION_UNSUPPORTED_KIND', '仅 Skill 支持质量评测');
      if (asset.lifecycle === 'blocked' || version.availability === 'revoked')
        fail(409, 'EVALUATION_UNAVAILABLE', '该版本不可评测');
      const request = publicationRequestId
        ? await this.store.get('requests', publicationRequestId)
        : undefined;
      if (
        publicationRequestId &&
        (request?.version_id !== version.id || request.asset_id !== asset.id)
      )
        notFound();
      return this.idempotency.execute(
        principal,
        'version-evaluation/' + versionId,
        key,
        request ? digest(canonical([versionId, request.id])) : digest(versionId),
        async () => {
          if (!(await this.hasManualQuota(asset.id)))
            fail(429, 'EVALUATION_QUOTA_EXCEEDED', '此资产已达到 UTC 当日手动评测次数上限');
          const result = (await this.register(
            versionId,
            'manual',
            request?.ruleset_version ?? null,
            request,
            principal.id,
          ))!;
          const { id, version_id, scope, state, reused_from } = result.row;
          await this.store.audit(principal.id, 'evaluation.requested', versionId, '', {
            asset_id: asset.id,
          });
          return {
            evaluation: { id, version_id, scope, state, reused_from },
            reused: result.reused,
          };
        },
      );
    });
  }

  private async backfill() {
    if (!this.settings.evaluationBackfill || Date.now() < this.nextBackfillCheck) return;
    const evaluator = this.model();
    const id = await this.store.nextEvaluationBackfill(
      evaluationRubricVersion,
      evaluator?.digest ?? null,
      new Date(Date.now() - 30 * dayMs).toISOString(),
    );
    if (!id) {
      this.nextBackfillCheck = Date.now() + 60000;
      return;
    }
    await this.store.tx(async () => {
      const release = await this.store.get('releases', id);
      if (!release) return;
      const asset = await this.store.get('assets', release.asset_id);
      const version = await this.store.get('versions', release.version_id);
      if (
        asset?.current_release_id === id &&
        asset.lifecycle !== 'blocked' &&
        version?.availability === 'released'
      )
        await this.register(version.id, 'backfill', null, release);
    });
  }

  async schedule() {
    await this.backfill();
    const active = await this.store.listRunningEvaluationSubjects();
    if (!active.length && !(await this.store.listQueuedEvaluations(1)).length) return;
    await this.store.tx(async () => {
      const subjects = new Set<string>();
      let slots = this.settings.evaluationConcurrency;
      let budget = await this.stages.remaining();
      for (const row of await this.store.listRunningEvaluations()) {
        const reason = await this.stages.unavailable(row);
        if (reason) {
          await this.stages.cancel(row, reason);
          continue;
        }
        subjects.add(row.subject_digest);
        const job = await this.store.get('jobs', row.active_job_id);
        if (job?.state !== 'queued' || job.run_after <= Date.now()) slots--;
        budget -= committedCalls(row, job);
      }
      // 剩余预算不够一整轮时轮转检查，防止排在长队后面的撤销和零调用复用饿死。
      const constrained = slots <= 0 || budget < fullCost;
      const limit = constrained ? 8 : slots;
      const queued = await this.store.listQueuedEvaluations(
        limit,
        constrained ? [] : [...subjects],
        constrained ? this.queueCursor : undefined,
      );
      const last = queued.at(-1);
      this.queueCursor =
        constrained && queued.length === limit && last
          ? { priority: last.priority, requested_at: last.requested_at, id: last.id }
          : undefined;
      for (let row of queued) {
        const reason = await this.stages.unavailable(row);
        if (reason) {
          await this.stages.cancel(row, reason);
          continue;
        }
        const reusable = await this.store.reusableEvaluation(
          row.subject_digest,
          row.rubric_version,
          row.evaluator_digest,
        );
        if (reusable && reusable.id !== row.reused_from) {
          row = reuseResult(row, reusable);
          row = await this.store.put('resource_evaluations', {
            ...row,
            revision: row.revision + 1,
          });
        }
        // 轮转游标只负责取消和复用；实际启动按队首优先级，避免低优先级越过尚未轮到的记录。
        if (constrained || row.state === 'succeeded' || subjects.has(row.subject_digest)) continue;
        if (slots <= 0 || (row.scope === 'full' && budget < pendingCalls(row))) continue;
        row = copyStructure(row, await this.store.listVersionEvaluations(row.version_id));
        subjects.add(row.subject_digest);
        slots--;
        if (row.scope === 'full') budget -= pendingCalls(row);
        await this.stages.advance(row);
      }
      if (!constrained || slots <= 0) return;
      // 队首中待补调用装得下剩余预算的记录照常启动：结构规范为零调用，部分结果只补跑失败阶段。
      for (let row of await this.store.listQueuedEvaluations(8, [...subjects])) {
        if (slots <= 0) break;
        const reason = await this.stages.unavailable(row);
        if (reason) {
          await this.stages.cancel(row, reason);
          continue;
        }
        const cost = row.scope === 'full' ? pendingCalls(row) : 0;
        if (subjects.has(row.subject_digest) || cost > budget) continue;
        row = copyStructure(row, await this.store.listVersionEvaluations(row.version_id));
        subjects.add(row.subject_digest);
        slots--;
        budget -= cost;
        await this.stages.advance(row);
      }
    });
  }
}
