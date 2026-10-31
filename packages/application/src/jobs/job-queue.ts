import {
  parseRecord,
  type JobInputMap,
  type JobKind,
  type JobRecord,
} from '@capability-hub/domain/models';
import { fail } from '@capability-hub/domain/errors';
import { randomUUID } from 'node:crypto';
import type { RecordStore } from '../ports/index.js';
const now = () => new Date().toISOString();
/** 使用租约代次约束结果提交，过期执行者不能写回结果。 */
export class JobQueue {
  constructor(private readonly store: RecordStore) {}
  async enqueue<K extends JobKind>(kind: K, aggregate_id: string, input: JobInputMap[K]) {
    return await this.store.insert(
      'jobs',
      parseRecord('jobs', {
        id: randomUUID(),
        kind,
        aggregate_id,
        input,
        state: 'queued',
        attempt: 0,
        run_after: Date.now(),
        lease_epoch: 0,
        lease_until: 0,
        cancel_requested: false,
        created_at: now(),
      }),
    );
  }
  async claim(worker: string) {
    return await this.store.tx(async () => {
      const job = (await this.store.all('jobs'))
        .filter(
          (j) =>
            !j.cancel_requested &&
            ((j.state === 'queued' && j.run_after <= Date.now()) ||
              (j.state === 'running' && j.lease_until <= Date.now())),
        )
        .sort((a, b) => a.run_after - b.run_after)[0];
      if (!job) return;
      return await this.store.put('jobs', {
        ...job,
        state: 'running',
        lease_owner: worker,
        lease_epoch: job.lease_epoch + 1,
        lease_until: Date.now() + 60000,
        attempt: job.attempt + 1,
      });
    });
  }
  private async activeLease(job: JobRecord) {
    const current = await this.store.get('jobs', job.id);
    if (
      !current ||
      current.lease_epoch !== job.lease_epoch ||
      current.lease_owner !== job.lease_owner ||
      current.state !== 'running' ||
      current.lease_until <= Date.now() ||
      current.cancel_requested
    )
      return;
    return current;
  }
  async assertLease(job: JobRecord) {
    const current = await this.activeLease(job);
    if (!current) fail(409, 'LEASE_LOST', '作业租约已失效');
    return current;
  }
  /** 租约校验与结果写入共用事务锁。 */
  async withLease<T>(job: JobRecord, write: (current: JobRecord) => T | Promise<T>): Promise<T> {
    return await this.store.tx(async () => write(await this.assertLease(job)));
  }
  async renew(job: JobRecord) {
    return await this.store.tx(async () => {
      const current = await this.activeLease(job);
      if (!current) return false;
      await this.store.put('jobs', { ...current, lease_until: Date.now() + 60000 });
      return true;
    });
  }
  /** 取消一旦提交，仍在读取的执行者也不能写回结果。 */
  async cancelRequested(onCancel: (job: JobRecord) => void | Promise<void>) {
    return await this.store.tx(async () => {
      const cancelled = (await this.store.all('jobs')).filter(
        (job) => job.cancel_requested && ['queued', 'running'].includes(job.state),
      );
      for (const job of cancelled) {
        await this.store.put('jobs', {
          ...job,
          state: 'cancelled',
          lease_until: 0,
          finished_at: now(),
          last_error_code: 'JOB_CANCELLED',
          error_message: '作业已取消',
        });
        await onCancel(job);
      }
    });
  }
}
