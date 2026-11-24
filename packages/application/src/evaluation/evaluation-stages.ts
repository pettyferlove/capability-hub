import {
  effectivenessResult,
  evaluationRubricVersion,
  evaluationStageRequests,
  evaluationThresholds,
} from '@capability-hub/domain/evaluation';
import { fail } from '@capability-hub/domain/errors';
import type {
  EvaluationDimensionResult,
  JobRecord,
  ResourceEvaluationRecord,
} from '@capability-hub/domain/models';
import type { JobQueue } from '../jobs/job-queue.js';
import type { RecordStore } from '../ports/index.js';

type EvaluationJob = Extract<JobRecord, { kind: 'resource_evaluation' }>;
type Evaluation = ResourceEvaluationRecord;
const maxStageRequests = Math.max(...Object.values(evaluationStageRequests));

/** 一次阶段提交只携带新生成的紧凑证据，完整模型输出不进入评测记录。 */
export interface EvaluationStageResult {
  dimension?: EvaluationDimensionResult;
  cases?: NonNullable<Evaluation['cases']>;
  context?: NonNullable<Evaluation['context']>;
  confusions?: NonNullable<Evaluation['confusions']>;
  assertions?: NonNullable<Evaluation['stages'][number]['assertion_results']>;
  coverageLimited?: boolean;
  skipped?: boolean;
}

/** 一次评测可由同一维度的多个独立阶段组成。 */
export function stageDimension(id: string): EvaluationDimensionResult['id'] {
  if (id.startsWith('trigger-')) return 'triggering';
  if (id.startsWith('task-')) return 'effectiveness';
  if (id === 'instructions' || id === 'transparency') return id;
  return 'structure';
}

/** 生成阶段尚未完成时按标准上限估算，完成后按实际保留下来的用例算本次领取所需额度。 */
function plannedCalls(row: Evaluation, id: string) {
  const cost = evaluationStageRequests[id as keyof typeof evaluationStageRequests] ?? 0;
  const prerequisite =
    id === 'trigger-routing' ? 'trigger-cases' : id.startsWith('task-run-') ? 'task-cases' : null;
  if (!prerequisite) return cost;
  const generator = row.stages.find((stage) => stage.id === prerequisite);
  if (!generator || generator.state === 'pending') return cost;
  if (generator.state !== 'succeeded') return 0;
  if (id === 'trigger-routing') {
    if (row.dimensions.some((dim) => dim.id === 'triggering' && dim.status === 'insufficient'))
      return 0;
    return row.cases?.trigger.length ?? 0;
  }
  return row.cases?.tasks.length === evaluationThresholds.effectiveness.cases ? cost : 0;
}

function dispatchedInLease(job: JobRecord | undefined, stage: Evaluation['stages'][number]) {
  if (
    job?.kind !== 'resource_evaluation' ||
    job.input.stage !== stage.id ||
    job.state !== 'running' ||
    job.lease_until <= Date.now()
  )
    return 0;
  if (job.lease_epoch === 1) return stage.requests ?? 0;
  if (job.evaluation_lease?.epoch !== job.lease_epoch) return 0;
  return Math.max(0, (stage.requests ?? 0) - job.evaluation_lease.prior_requests);
}

/** 续领时整阶段重做；只有当前租约确实已派发的调用才可从待用额度中扣除。 */
export function pendingCalls(row: Evaluation, current?: JobRecord) {
  return row.stages.reduce((total, stage) => {
    if (stage.state !== 'pending') return total;
    const dispatched = dispatchedInLease(current, stage);
    return total + Math.max(0, plannedCalls(row, stage.id) - dispatched);
  }, 0);
}

// 预留状态、下一作业 ID 和取消原因的空间，避免已经写入的证据阻塞后续收尾。
const resultBytes = 128 * 1024 - 1024;

function compactResult(row: Evaluation) {
  const fits = (value: Evaluation) => Buffer.byteLength(JSON.stringify(value)) <= resultBytes;
  if (fits(row)) return row;
  const compact = structuredClone(row);
  for (const limit of [120, 0]) {
    for (const dimension of compact.dimensions) {
      if (dimension.summary)
        dimension.summary = Array.from(dimension.summary).slice(0, limit).join('') || undefined;
      for (const check of dimension.checks) {
        if (check.note) check.note = Array.from(check.note).slice(0, limit).join('') || undefined;
        if (check.suggestion)
          check.suggestion = Array.from(check.suggestion).slice(0, limit).join('') || undefined;
      }
    }
    if (fits(compact)) return compact;
  }
  for (const dimension of compact.dimensions)
    for (const check of dimension.checks) check.evidence = check.evidence.slice(0, 1);
  for (const stage of compact.stages)
    for (const pair of stage.assertion_results ?? [])
      for (const verdict of [pair.with_skill, pair.without_skill])
        verdict.quote = Array.from(verdict.quote.trim()).slice(0, 32).join('');
  return fits(compact) ? compact : null;
}

/** 调度和出站共用实例当前的额度与并发选择。 */
export interface EvaluationSettings {
  evaluationConcurrency: number;
  evaluationDailyRequests: number;
  evaluationBackfill: boolean;
}

/** 每次出站前重新读取评测器，识别切换档案或禁用模型。 */
export type EvaluationModel = () => { profileId: string; digest: string } | null;

/** UTC 日没有夏令时切换，窗口边界按纪元日计算。 */
export const dayMs = 86400000;

/** 当日预占和手动请求次数使用相同的 UTC 零点。 */
export const utcWindow = () => Math.floor(Date.now() / dayMs) * dayMs;

/** 评测证据仅随有效作业租约落库。阶段收尾、下一作业与活动指针共用事务。 */
export class EvaluationStages {
  constructor(
    private readonly store: RecordStore,
    private readonly jobs: JobQueue,
    private readonly settings: EvaluationSettings,
    private readonly model: EvaluationModel,
  ) {}

  async remaining() {
    const window = await this.store.evaluationSchedule();
    return (
      this.settings.evaluationDailyRequests -
      (window?.window_start === utcWindow() ? window.reserved : 0)
    );
  }

  async unavailable(row: Evaluation) {
    if (
      row.rubric_version !== evaluationRubricVersion ||
      row.stages.some((stage) => !Object.hasOwn(evaluationStageRequests, stage.id)) ||
      (row.scope === 'full' && row.evaluator_digest !== this.model()?.digest)
    )
      return 'EVALUATOR_CHANGED';
    const version = await this.store.get('versions', row.version_id);
    const asset = await this.store.get('assets', row.asset_id);
    return !version || version.availability === 'revoked' || !asset || asset.lifecycle === 'blocked'
      ? 'EVALUATION_UNAVAILABLE'
      : null;
  }

  async cancel(row: Evaluation, code: string) {
    const now = new Date().toISOString();
    const job = await this.store.get('jobs', row.active_job_id);
    if (job && (job.state === 'queued' || job.state === 'running'))
      await this.store.put('jobs', {
        ...job,
        state: 'cancelled',
        last_error_code: code,
        lease_until: 0,
        finished_at: now,
      });
    await this.store.put('resource_evaluations', {
      ...row,
      state: 'cancelled',
      active_job_id: null,
      stages: row.stages.map((stage) =>
        stage.state === 'pending'
          ? { ...stage, state: 'skipped', failure_code: code, finished_at: now }
          : stage,
      ),
      failure_code: code,
      finished_at: now,
      revision: row.revision + 1,
    });
  }

  private async active(job: EvaluationJob) {
    const row = await this.store.get('resource_evaluations', job.input.evaluation_id);
    if (
      !row ||
      row.state !== 'running' ||
      row.active_job_id !== job.id ||
      !row.stages.some((stage) => stage.id === job.input.stage && stage.state === 'pending')
    )
      fail(409, 'LEASE_LOST', '评测阶段已被接管或取消');
    return row;
  }

  async prepare(job: EvaluationJob) {
    return this.jobs.withLease(job, async (current) => {
      const row = await this.active(job);
      const reason = await this.unavailable(row);
      if (reason) {
        await this.cancel(row, reason);
        return 'cancelled' as const;
      }
      const required = plannedCalls(row, job.input.stage);
      if (required === 0 && job.input.stage !== 'static')
        return this.complete(job, { skipped: true });
      if (required > 0 && (await this.remaining()) < required) {
        await this.waitForWindow(current);
        return 'queued' as const;
      }
      if (
        required > 0 &&
        current.lease_epoch > 1 &&
        current.evaluation_lease?.epoch !== current.lease_epoch
      ) {
        const stage = row.stages.find((item) => item.id === job.input.stage)!;
        await this.store.put('jobs', {
          ...current,
          evaluation_lease: { epoch: current.lease_epoch, prior_requests: stage.requests ?? 0 },
        });
        if (!stage.execution_id) return row;
        // 旧执行的已派发次数保留，待本租约首次出站后再关联新的执行账本。
        return this.store.put('resource_evaluations', {
          ...row,
          stages: row.stages.map((stage) =>
            stage.id === job.input.stage ? { ...stage, execution_id: undefined } : stage,
          ),
          revision: row.revision + 1,
        });
      }
      return row;
    });
  }

  private async settleTasks(row: Evaluation) {
    const tasks = row.cases?.tasks;
    if (
      tasks?.length !== evaluationThresholds.effectiveness.cases ||
      !row.dimensions.some(
        (dim) =>
          dim.id === 'effectiveness' && (dim.status === 'pending' || dim.status === 'failed'),
      )
    )
      return row;
    const runs = row.stages.filter((stage) => stage.id.startsWith('task-run-'));
    if (runs.length !== tasks.length || runs.some((stage) => stage.state === 'pending')) return row;
    const assertions = runs.flatMap((stage) => stage.assertion_results ?? []);
    if (!assertions.length) return row;
    const scripts = row.dimensions.find((dim) => dim.id === 'structure')?.metrics?.scripts;
    const scriptDependent =
      tasks.some((task) => task.script_dependent) &&
      (scripts === undefined
        ? (await this.store.get('versions', row.version_id))?.metadata.has_scripts === true
        : scripts > 0);
    const limited = row.stages.some(
      (stage) =>
        stage.id.startsWith('task-') && (stage.coverage_limited || stage.state === 'failed'),
    );
    const result = effectivenessResult(assertions, scriptDependent, limited);
    return {
      ...row,
      dimensions: row.dimensions.map((dim) => (dim.id === result.id ? result : dim)),
    };
  }

  async advance(pending: Evaluation) {
    const row = await this.settleTasks(pending);
    const staticFailure = row.stages.find(
      (stage) => stage.id === 'static' && stage.state === 'failed',
    );
    const next = !staticFailure && row.stages.find((stage) => stage.state === 'pending');
    const now = new Date().toISOString();
    if (!next) {
      const failed = !!staticFailure || !row.dimensions.some((dim) => dim.status === 'scored');
      await this.store.put('resource_evaluations', {
        ...row,
        active_job_id: null,
        state: failed
          ? 'failed'
          : row.stages.some((stage) => stage.state === 'failed')
            ? 'partial'
            : 'succeeded',
        ...(failed && {
          failure_code: staticFailure?.failure_code ?? 'EVALUATION_NO_USABLE_DIMENSION',
        }),
        stages: row.stages.map((stage) =>
          stage.state === 'pending' ? { ...stage, state: 'skipped', finished_at: now } : stage,
        ),
        finished_at: now,
        revision: row.revision + 1,
      });
      return;
    }
    const job = await this.jobs.enqueue('resource_evaluation', row.id, {
      evaluation_id: row.id,
      stage: next.id,
    });
    const required = plannedCalls(row, next.id);
    if (required > 0 && (await this.remaining()) < required)
      await this.store.put('jobs', { ...job, run_after: utcWindow() + dayMs });
    await this.store.put('resource_evaluations', {
      ...row,
      state: 'running',
      active_job_id: job.id,
      started_at: row.started_at ?? now,
      revision: row.revision + 1,
    });
  }

  private async otherStageDemand(jobId: string) {
    let needed = 0;
    for (const row of await this.store.listRunningEvaluations()) {
      if (!row.active_job_id || row.active_job_id === jobId) continue;
      const job = await this.store.get('jobs', row.active_job_id);
      if (
        job?.kind !== 'resource_evaluation' ||
        job.state !== 'running' ||
        job.lease_until <= Date.now()
      )
        continue;
      const stage = row.stages.find((item) => item.id === job.input.stage);
      if (!stage) continue;
      const dispatched = dispatchedInLease(job, stage);
      if (!dispatched) continue;
      needed += Math.max(0, plannedCalls(row, stage.id) - dispatched);
    }
    return needed;
  }

  /** 由 inline 的出站预留钩子调用，账本与 UTC 窗口任一写入失败均不会发出请求。 */
  async reserve(
    job: EvaluationJob,
    executionId: string | undefined,
    authorize?: () => Promise<void>,
  ) {
    await this.jobs.withLease(job, async (current) => {
      const row = await this.active(job);
      const reason = await this.unavailable(row);
      if (reason) fail(409, reason, '资源或评测器已变化');
      await authorize?.();
      const start = utcWindow();
      const window = await this.store.evaluationSchedule();
      const reserved = window?.window_start === start ? window.reserved : 0;
      const stage = row.stages.find((s) => s.id === job.input.stage)!;
      const inThisLease = dispatchedInLease(current, stage);
      const required = Math.max(1, plannedCalls(row, stage.id) - inThisLease);
      let available = this.settings.evaluationDailyRequests - reserved;
      if (
        inThisLease === 0 &&
        this.settings.evaluationConcurrency > 1 &&
        available < required + maxStageRequests * (this.settings.evaluationConcurrency - 1)
      )
        available -= await this.otherStageDemand(job.id);
      if (available < required) fail(429, 'EVALUATION_WINDOW_EXHAUSTED', '等待下一 UTC 额度窗口');
      const updated = {
        id: 'resource-evaluations' as const,
        window_start: start,
        reserved: reserved + 1,
        updated_at: new Date().toISOString(),
      };
      if (window) await this.store.put('evaluation_schedule', updated);
      else await this.store.insert('evaluation_schedule', updated);
      await this.store.put('resource_evaluations', {
        ...row,
        revision: row.revision + 1,
        stages: row.stages.map((stage) =>
          stage.id === job.input.stage
            ? { ...stage, requests: (stage.requests ?? 0) + 1, execution_id: executionId }
            : stage,
        ),
      });
    });
  }

  private async waitForWindow(current: JobRecord) {
    await this.store.put('jobs', {
      ...current,
      state: 'queued',
      lease_until: 0,
      run_after: utcWindow() + dayMs,
    });
  }

  async defer(job: EvaluationJob) {
    await this.jobs.withLease(job, (current) => this.waitForWindow(current));
  }

  async complete(job: EvaluationJob, result: EvaluationStageResult) {
    return this.jobs.withLease(job, async (current) => {
      const row = await this.active(job);
      const reason = await this.unavailable(row);
      if (reason) {
        await this.cancel(row, reason);
        return 'cancelled';
      }
      const now = new Date().toISOString();
      const failure = result.dimension?.failure_code;
      const updated = compactResult({
        ...row,
        cases: result.cases ?? row.cases,
        context: result.context ?? row.context,
        confusions: result.confusions ?? row.confusions,
        stages: row.stages.map((stage) =>
          stage.id !== job.input.stage
            ? stage
            : {
                ...stage,
                state: failure ? 'failed' : result.skipped ? 'skipped' : 'succeeded',
                requests: stage.requests ?? 0,
                finished_at: now,
                ...(failure && { failure_code: failure }),
                ...(result.assertions && { assertion_results: result.assertions }),
                ...(result.coverageLimited && { coverage_limited: true }),
              },
        ),
        dimensions: row.dimensions.map((dim) =>
          result.dimension?.id === dim.id ? result.dimension : dim,
        ),
      });
      const code = updated ? failure : 'EVALUATION_RECORD_TOO_LARGE';
      const state = code ? ('failed' as const) : ('succeeded' as const);
      await this.store.put('jobs', {
        ...current,
        state,
        finished_at: now,
        lease_until: 0,
        ...(code && { last_error_code: code }),
      });
      if (updated) await this.advance(updated);
      else await this.settleProblem(job, 'failed', 'EVALUATION_RECORD_TOO_LARGE');
      return state;
    });
  }

  /** 内容作业耗尽存储重试或被取消时，与作业的终态同事务结算。 */
  async settleProblem(job: EvaluationJob, state: 'failed' | 'cancelled', code: string) {
    const row = await this.store.get('resource_evaluations', job.input.evaluation_id);
    if (!row || row.state !== 'running' || row.active_job_id !== job.id) return;
    if (state === 'cancelled') return this.cancel(row, code);
    const now = new Date().toISOString();
    const stages = row.stages.map((stage) =>
      stage.id === job.input.stage
        ? { ...stage, state: 'failed' as const, failure_code: code, finished_at: now }
        : stage,
    );
    const dimensions = row.dimensions.map((dim) =>
      dim.id === stageDimension(job.input.stage)
        ? { ...dim, status: 'failed' as const, score: null, confidence: null, failure_code: code }
        : dim,
    );
    await this.advance({ ...row, dimensions, stages });
  }
}
