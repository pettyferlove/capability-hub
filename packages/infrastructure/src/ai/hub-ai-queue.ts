import { AiError, type AiQueueBridge, type ExecutionLease } from '@capability-hub/ai';
import type { JobQueue } from '@capability-hub/application';
import type { RecordStore } from '@capability-hub/application/ports';
import type { JobRecord } from '@capability-hub/domain/models';
import { HubError } from '@capability-hub/domain/errors';

export class HubAiQueue implements AiQueueBridge {
  constructor(
    private readonly store: RecordStore,
    private readonly jobs: JobQueue,
  ) {}
  async enqueue(executionId: string) {
    return (await this.jobs.enqueue('ai_execution', executionId, { execution_id: executionId })).id;
  }
  private async job(lease: ExecutionLease): Promise<JobRecord> {
    const job = await this.store.get('jobs', lease.dispatch_id);
    if (
      !job ||
      job.kind !== 'ai_execution' ||
      job.input.execution_id !== lease.execution_id ||
      job.lease_owner !== lease.owner ||
      job.lease_epoch !== lease.epoch
    )
      throw new AiError('AI_LEASE_LOST', '作业租约已失效');
    try {
      return await this.jobs.assertLease(job);
    } catch (error) {
      if (error instanceof HubError && error.code === 'LEASE_LOST')
        throw new AiError('AI_LEASE_LOST', '作业租约已失效');
      throw error;
    }
  }
  async assert(lease: ExecutionLease) {
    await this.job(lease);
  }
  async cancel(dispatchId: string) {
    const job = await this.store.get('jobs', dispatchId);
    if (job && ['running', 'queued'].includes(job.state))
      await this.store.put('jobs', {
        ...job,
        state: 'cancelled',
        cancel_requested: true,
        lease_until: 0,
        finished_at: new Date().toISOString(),
      });
  }
  async finish(lease: ExecutionLease, status: 'succeeded' | 'failed') {
    const job = await this.job(lease);
    await this.store.put('jobs', {
      ...job,
      state: status,
      lease_until: 0,
      finished_at: new Date().toISOString(),
    });
  }
  async retry(lease: ExecutionLease, delayMs: number) {
    const job = await this.job(lease);
    await this.store.put('jobs', {
      ...job,
      state: 'queued',
      lease_until: 0,
      run_after: Date.now() + delayMs,
    });
  }
}
