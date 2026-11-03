import { AsyncLocalStorage } from 'node:async_hooks';
import type { AiStore, AiQueueBridge, ExecutionLease } from '../core/ports.js';
import type { ExecutionRecord } from '../core/records.js';
import { AiError } from '../core/errors.js';

/**
 * 单轮执行的作用域。`controller` 的 abort reason 必须是 {@link AiError}：只有
 * `AI_INTERRUPTED`/`AI_LEASE_LOST`/`AI_CANCELLED`/`AI_DEADLINE_EXCEEDED` 会被写库路径直接抛出，
 * 其它原因视为普通失败。`definition_digest` 是进入本轮时的定义摘要，用于发现运行期换了定义。
 */
export interface RunScope {
  lease: ExecutionLease;
  owner_id: string;
  definition_digest: string;
  controller: AbortController;
  step?: { id: string; start_seq: number };
}

/**
 * 把单轮执行上下文（租约、所有者、`AbortController`）放进 `AsyncLocalStorage`，
 * 让深层调用共享同一轮执行。`write` 会在同一事务里复查中止原因、租约与 deadline，
 * 写库必须经它而非直接落记录，否则失去租约后可能覆盖新执行者的写入。
 */
export class ExecutionScope {
  private readonly context = new AsyncLocalStorage<RunScope>();
  constructor(
    readonly store: AiStore,
    readonly queue: AiQueueBridge,
  ) {}
  run<T>(scope: RunScope, work: () => Promise<T>): Promise<T> {
    return this.context.run(scope, work);
  }
  current(): RunScope {
    const value = this.context.getStore();
    if (!value) throw new AiError('AI_LEASE_LOST', '缺少执行作用域');
    return value;
  }
  async read(): Promise<ExecutionRecord> {
    const context = this.current();
    const record = await this.store.get('ai_executions', context.lease.execution_id);
    if (!record || record.owner_id !== context.owner_id)
      throw new AiError('AI_LEASE_LOST', '执行归属已失效');
    return record;
  }
  async write<T>(work: (execution: ExecutionRecord) => Promise<T>): Promise<T> {
    return this.store.tx(async () => {
      const scope = this.current();
      const reason: unknown = scope.controller.signal.reason;
      if (
        scope.controller.signal.aborted &&
        reason instanceof AiError &&
        ['AI_INTERRUPTED', 'AI_LEASE_LOST', 'AI_CANCELLED', 'AI_DEADLINE_EXCEEDED'].includes(
          reason.code,
        )
      )
        throw reason;
      await this.queue.assert(scope.lease);
      const execution = await this.read();
      if (
        execution.status !== 'running' ||
        execution.payload.dispatch_id !== scope.lease.dispatch_id
      )
        throw new AiError('AI_LEASE_LOST', '执行写入资格已失效');
      if (execution.payload.deadline <= Date.now())
        throw new AiError('AI_DEADLINE_EXCEEDED', '执行已超过总期限');
      return work(execution);
    });
  }
}
