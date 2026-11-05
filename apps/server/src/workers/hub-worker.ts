import { HubError } from '@capability-hub/domain/errors';
import type { JobRecord } from '@capability-hub/domain/models';
import { randomUUID } from 'node:crypto';
import type { HubServices } from '../bootstrap/hub-services.js';
import type { SourceService } from '@capability-hub/application';
import { AiError } from '@capability-hub/ai';

interface ActiveJob {
  job: JobRecord;
  controller?: AbortController;
  promise: Promise<void>;
}

/**
 * 秒级调度只串行认领，内容与 AI 作业共享空位，各自续租。停止后中断在跑的 AI，
 * 等待已认领的内容作业和租约清理落定，再允许关闭存储。
 */
export class HubWorker {
  readonly id = randomUUID();
  private running: Promise<void> | undefined;
  private stopped = false;
  private timer: ReturnType<typeof setInterval> | undefined;
  private scheduling: Promise<void> | undefined;
  private readonly active = new Map<string, ActiveJob>();
  constructor(
    private readonly hub: HubServices,
    private readonly sources: SourceService,
  ) {}
  get busy() {
    return !!(this.scheduling || this.running || this.active.size);
  }
  get status(): 'stopped' | 'idle' | 'busy' {
    if (this.busy) return 'busy';
    return this.timer ? 'idle' : 'stopped';
  }
  start() {
    if (this.timer || this.stopped) return;
    const run = () => {
      void this.schedule().catch((err) =>
        this.hub.logs.logger.error({ event: 'worker.tick_failed', err, worker_id: this.id }),
      );
    };
    this.timer = setInterval(run, 1000);
    this.timer.unref();
    run();
  }
  async stop() {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    const control = await Promise.allSettled([this.scheduling]);
    const active = [...this.active.values()];
    for (const task of active)
      task.controller?.abort(new AiError('AI_INTERRUPTED', '服务正在关闭'));
    const results = [
      ...control,
      ...(await Promise.allSettled([this.running, ...active.map((task) => task.promise)])),
    ];
    const failures = results
      .filter((result) => result.status === 'rejected')
      .map((result) => result.reason as unknown);
    if (failures.length) throw new AggregateError(failures, '关闭 Worker 失败');
  }
  async waitForIdle() {
    while (this.busy) {
      await this.scheduling;
      await Promise.all([
        this.running,
        ...Array.from(this.active.values(), (task) => task.promise),
      ]);
    }
  }
  private schedule(): Promise<void> {
    if (this.scheduling) return this.scheduling;
    if (this.stopped) return Promise.resolve();
    this.scheduling = this.hub.logs
      .run({ worker_id: this.id }, () => this.dispatchReady())
      .finally(() => {
        this.scheduling = undefined;
      });
    return this.scheduling;
  }
  private async dispatchReady() {
    await this.cancelRequestedJobs();
    await this.hub.ai.runtime.expireWaiting();
    for (const { job, controller } of this.active.values()) {
      if (!controller || controller.signal.aborted) continue;
      const execution = await this.hub.ai.runtime.get(job.aggregate_id);
      if (execution.status !== 'running' && execution.status !== 'queued')
        controller.abort(new AiError('AI_CANCELLED', '执行已结束'));
    }
    await this.pollSources();
    if (this.stopped) return;
    const jobs = await this.hub.jobs.claimBatch(this.id, { activeIds: [...this.active.keys()] });
    for (const job of jobs) {
      const controller = job.kind === 'ai_execution' ? new AbortController() : undefined;
      if (this.stopped) controller?.abort(new AiError('AI_INTERRUPTED', '服务正在关闭'));
      const promise = (controller ? this.runAi(job, controller) : this.runContent(job)).finally(
        () => {
          this.active.delete(job.id);
        },
      );
      this.active.set(job.id, { job, controller, promise });
      void promise.catch((err) =>
        this.hub.logs.logger.error({
          event: controller ? 'ai.dispatch_failed' : 'job.failed',
          job_id: job.id,
          err,
        }),
      );
    }
  }
  private async runAi(job: JobRecord, controller: AbortController) {
    let heartbeat: ReturnType<typeof setTimeout> | undefined;
    let renewal = Promise.resolve();
    let finishing = false;
    const schedule = () => {
      if (finishing) return;
      heartbeat = setTimeout(() => {
        renewal = (async () => {
          try {
            if (!(await this.hub.jobs.renew(job))) {
              controller.abort(new AiError('AI_LEASE_LOST', '作业租约已失效'));
              return;
            }
            schedule();
          } catch {
            controller.abort(new AiError('AI_LEASE_LOST', '无法确认作业租约'));
          }
        })();
      }, 20000);
      heartbeat.unref();
    };
    schedule();
    try {
      await this.hub.ai.runtime.process(
        {
          execution_id: job.aggregate_id,
          dispatch_id: job.id,
          owner: this.id,
          epoch: job.lease_epoch,
          attempt: job.attempt,
        },
        controller.signal,
      );
    } finally {
      finishing = true;
      if (heartbeat) clearTimeout(heartbeat);
      await renewal;
    }
  }
  tick(): Promise<void> {
    if (this.running) return this.running;
    if (this.stopped) return Promise.resolve();
    this.running = this.schedule()
      .then(async () => {
        const content = [...this.active.values()].filter((task) => !task.controller);
        await Promise.all(content.map((task) => task.promise));
      })
      .finally(() => {
        this.running = undefined;
      });
    return this.running;
  }
  private async cancelRequestedJobs() {
    await this.hub.jobs.cancelRequested(async (job) => {
      if (job.kind === 'ai_execution') return;
      const intakes =
        job.kind === 'source_sync'
          ? await this.hub.store.where('intakes', 'source_sync_job_id', job.id)
          : [await this.hub.store.get('intakes', job.aggregate_id)];
      for (const intake of intakes)
        if (intake && ['received', 'fetching', 'scanning'].includes(intake.state))
          await this.hub.store.put('intakes', {
            ...intake,
            state: 'cancelled',
            phase: '已取消',
            error_code: 'JOB_CANCELLED',
            error_message: '作业已取消',
            retryable: false,
            finished_at: new Date().toISOString(),
          });
    });
  }
  private async pollSources() {
    for (const s of (await this.hub.store.all('sources')).filter(
      (s) =>
        s.kind === 'git' &&
        s.state === 'active' &&
        !s.distribution_revoked_at &&
        s.next_poll_at <= Date.now(),
    )) {
      const owner = (
        await Promise.all(
          (await this.hub.store.all('users'))
            .filter((u) => u.active)
            .map(async (u) => await this.hub.identity.principal(u.id)),
        )
      ).find((p) => {
        try {
          this.hub.assetAccess.requireSourceManagement(p, s);
          return true;
        } catch {
          return false;
        }
      });
      if (owner)
        try {
          await this.sources.sync(
            owner,
            s.id,
            `poll-${s.revision}-${Math.floor(Date.now() / 300000)}`,
            true,
          );
        } catch (error) {
          this.hub.logs.logger.warn({ event: 'source.poll_failed', source_id: s.id, err: error });
        }
      await this.hub.store.tx(async () => {
        const latest = await this.hub.store.get('sources', s.id);
        if (latest?.kind === 'git' && latest.revision === s.revision)
          await this.hub.store.put('sources', { ...latest, next_poll_at: Date.now() + 300000 });
      });
    }
  }
  private async runContent(job: JobRecord) {
    let heartbeat: ReturnType<typeof setTimeout> | undefined;
    let renewal = Promise.resolve();
    let finishing = false;
    try {
      this.hub.logs.logger.info({
        event: 'job.started',
        job_id: job.id,
        kind: job.kind,
        attempt: job.attempt,
        lease_epoch: job.lease_epoch,
      });
      const scheduleRenewal = () => {
        if (finishing) return;
        heartbeat = setTimeout(() => {
          renewal = (async () => {
            let keep = true;
            try {
              if (!(await this.hub.jobs.renew(job))) {
                keep = false;
                await this.cancelRequestedJobs();
              }
            } catch (err) {
              this.hub.logs.logger.error({
                event: 'worker.heartbeat_failed',
                worker_id: this.id,
                job_id: job.id,
                err,
              });
            }
            if (keep) scheduleRenewal();
          })();
        }, 20000);
        heartbeat.unref();
      };
      scheduleRenewal();
      if (job.kind === 'source_sync') await this.hub.sourceSync.process(job);
      else {
        const intake = (await this.hub.store.get('intakes', job.aggregate_id))!;
        const version =
          job.kind === 'rescan'
            ? await this.hub.store.get('versions', job.input.version_id)
            : undefined;
        const files = version
          ? await Promise.all(
              version.files.map(async (f) => ({
                path: f.path,
                bytes: await this.hub.blobs.read(f.blob_ref),
                executable: f.executable,
              })),
            )
          : undefined;
        await this.hub.intakeProcessor.process(intake, job, files);
      }
      await this.cancelRequestedJobs();
      await this.hub.jobs.withLease(job, async (current) => {
        await this.hub.store.put('jobs', {
          ...current,
          state: 'succeeded',
          finished_at: new Date().toISOString(),
          lease_until: 0,
        });
      });
      this.hub.logs.logger.info({
        event: 'job.succeeded',
        job_id: job.id,
        lease_epoch: job.lease_epoch,
      });
    } catch (e) {
      this.hub.logs.logger.error({ event: 'job.failed', job_id: job.id, err: e });
      const error =
        e instanceof HubError
          ? e
          : new HubError(500, 'JOB_PROCESSING_FAILED', '任务暂时无法完成，请稍后重试', {}, true);
      try {
        await this.cancelRequestedJobs();
        await this.hub.jobs.withLease(job, async (current) => {
          const retry = error.retryable && current.attempt < 3;
          const cancelled = [
            'SOURCE_CONFIG_CHANGED',
            'SOURCE_GENERATION_CHANGED',
            'LEASE_LOST',
          ].includes(error.code);
          await this.hub.store.put('jobs', {
            ...current,
            state: retry ? 'queued' : cancelled ? 'cancelled' : 'failed',
            last_error_code: error.code,
            error_message: error.message,
            run_after: Date.now() + [30000, 120000, 600000][Math.min(current.attempt - 1, 2)],
            lease_until: 0,
            ...(!retry ? { finished_at: new Date().toISOString() } : {}),
          });
          if (['intake', 'rescan'].includes(job.kind)) {
            const intake = await this.hub.store.get('intakes', job.aggregate_id);
            if (intake)
              await this.hub.store.put('intakes', {
                ...intake,
                state: retry ? 'received' : cancelled ? 'cancelled' : 'failed',
                error_code: error.code,
                error_message: error.message,
                retryable: error.retryable,
                phase: retry ? '等待重试' : cancelled ? '已取消' : '处理失败',
                ...(retry
                  ? {
                      progress: [
                        { step: 'received' as const, started_at: new Date().toISOString() },
                      ],
                    }
                  : {}),
                finished_at: retry ? null : new Date().toISOString(),
              });
          }
        });
      } catch (failure) {
        if (!(failure instanceof HubError && failure.code === 'LEASE_LOST')) throw failure;
      }
    } finally {
      finishing = true;
      if (heartbeat) clearTimeout(heartbeat);
      await renewal;
    }
  }
}
