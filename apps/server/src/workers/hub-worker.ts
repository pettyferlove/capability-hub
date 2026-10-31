import { HubError } from '@capability-hub/domain/errors';
import type { JobRecord } from '@capability-hub/domain/models';
import { randomUUID } from 'node:crypto';
import type { HubServices } from '../bootstrap/hub-services.js';
import type { SourceService } from '@capability-hub/application';
import { AiError } from '@capability-hub/ai';
export class HubWorker {
  readonly id = randomUUID();
  private running: Promise<void> | undefined;
  private stopped = false;
  private timer: ReturnType<typeof setInterval> | undefined;
  private aiControl: Promise<void> | undefined;
  private aiActive:
    { job: JobRecord; controller: AbortController; promise: Promise<void> } | undefined;
  constructor(
    private readonly hub: HubServices,
    private readonly sources: SourceService,
  ) {}
  get busy() {
    return this.running !== undefined || this.aiActive !== undefined;
  }
  start() {
    if (this.timer || this.stopped) return;
    const run = () => {
      void this.tickAi().catch((err) =>
        this.hub.logs.logger.error({ event: 'ai.scheduler_failed', err }),
      );
      void this.tick().catch((err) =>
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
    const control = await Promise.allSettled([this.aiControl]);
    this.aiActive?.controller.abort(new AiError('AI_INTERRUPTED', '服务正在关闭'));
    const results = [
      ...control,
      ...(await Promise.allSettled([this.running, this.aiActive?.promise])),
    ];
    const failures = results
      .filter((result) => result.status === 'rejected')
      .map((result) => result.reason as unknown);
    if (failures.length) throw new AggregateError(failures, '关闭 Worker 失败');
  }
  async waitForIdle() {
    await this.aiControl;
    await Promise.all([this.running, this.aiActive?.promise]);
  }
  private tickAi(): Promise<void> {
    if (this.aiControl) return this.aiControl;
    if (this.stopped) return Promise.resolve();
    this.aiControl = (async () => {
      await this.hub.ai.runtime.expireWaiting();
      if (this.aiActive) {
        const execution = await this.hub.ai.runtime.get(this.aiActive.job.aggregate_id);
        if (execution.status !== 'running' && execution.status !== 'queued')
          this.aiActive.controller.abort(new AiError('AI_CANCELLED', '执行已结束'));
        return;
      }
      const job = await this.hub.jobs.claim(this.id, ['ai_execution']);
      if (!job) return;
      const controller = new AbortController();
      if (this.stopped) controller.abort(new AiError('AI_INTERRUPTED', '服务正在关闭'));
      const active = { job, controller, promise: Promise.resolve() };
      this.aiActive = active;
      active.promise = this.runAi(job, controller)
        .catch((err) => {
          this.hub.logs.logger.error({ event: 'ai.dispatch_failed', job_id: job.id, err });
        })
        .finally(() => {
          if (this.aiActive === active) this.aiActive = undefined;
        });
    })().finally(() => {
      this.aiControl = undefined;
    });
    return this.aiControl;
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
    this.running = this.hub.logs
      .run({ worker_id: this.id }, async () => await this.runTick())
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
  private async runTick() {
    let job: JobRecord | undefined;
    let heartbeat: ReturnType<typeof setTimeout> | undefined;
    let renewal = Promise.resolve();
    let finishing = false;
    try {
      await this.cancelRequestedJobs();
      await this.tickAi();
      for (const s of (await this.hub.store.all('sources')).filter(
        (s) => s.kind === 'git' && s.state === 'active' && s.next_poll_at <= Date.now(),
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
            await this.sources.sync(owner, s.id, 'poll-' + Math.floor(Date.now() / 300000));
          } catch (error) {
            this.hub.logs.logger.warn({ event: 'source.poll_failed', source_id: s.id, err: error });
          }
        await this.hub.store.tx(async () => {
          const latest = await this.hub.store.get('sources', s.id);
          if (latest?.kind === 'git')
            await this.hub.store.put('sources', { ...latest, next_poll_at: Date.now() + 300000 });
        });
      }
      job = await this.hub.jobs.claim(this.id, ['intake', 'rescan', 'source_sync']);
      if (!job) return;
      const captured = job;
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
              if (!(await this.hub.jobs.renew(captured))) {
                keep = false;
                await this.cancelRequestedJobs();
              }
            } catch (err) {
              this.hub.logs.logger.error({
                event: 'worker.heartbeat_failed',
                worker_id: this.id,
                job_id: captured.id,
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
      await this.hub.jobs.withLease(captured, async (current) => {
        await this.hub.store.put('jobs', {
          ...current,
          state: 'succeeded',
          finished_at: new Date().toISOString(),
          lease_until: 0,
        });
      });
      this.hub.logs.logger.info({
        event: 'job.succeeded',
        job_id: captured.id,
        lease_epoch: captured.lease_epoch,
      });
    } catch (e) {
      this.hub.logs.logger.error({ event: 'job.failed', job_id: job?.id, err: e });
      if (job) {
        const error =
          e instanceof HubError
            ? e
            : new HubError(500, 'JOB_PROCESSING_FAILED', '任务暂时无法完成，请稍后重试', {}, true);
        const captured = job;
        try {
          await this.cancelRequestedJobs();
          await this.hub.jobs.withLease(captured, async (current) => {
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
            if (['intake', 'rescan'].includes(captured.kind)) {
              const intake = await this.hub.store.get('intakes', captured.aggregate_id);
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
      } else throw e;
    } finally {
      finishing = true;
      if (heartbeat) clearTimeout(heartbeat);
      await renewal;
    }
  }
}
