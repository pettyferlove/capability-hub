import { AsyncLocalStorage } from 'node:async_hooks';
import { z } from 'zod';
import {
  AiRuntime,
  OperationRegistry,
  aiConfigurationSchema,
  type AiStore,
  type ExecutionLease,
} from '@capability-hub/ai';
import { createStep, createWorkflow } from '@capability-hub/ai/mastra';
import type { AiRecordMap, AiTable } from '@capability-hub/ai/records';
import { JobQueue } from '@capability-hub/application';
import type { RecordStore } from '@capability-hub/application/ports';
import { createAiStore, HubAiQueue } from '@capability-hub/infrastructure/ai';

/** 恢复测试用的 profile：指向不存在的 fixture 地址，`credential_ref` 由 fixture 解析器接管。 */
export const recoveryConfig = aiConfigurationSchema.parse({
  profiles: [
    {
      id: 'fixture',
      label: 'Fixture',
      format: 'openai',
      base_url: 'https://example.test/v1',
      model: 'fixture',
      credential_ref: 'AI_FIXTURE_KEY',
    },
  ],
  default_profile: 'fixture',
});
/**
 * 可以在事务提交后被观察到的恢复断点：`effect` 是副作用步骤结束，`terminal` 是全流程成功，
 * `resume` 是由挂起转回运行——三种各自对应一类需要重放时不能重复执行的情况。
 */
export type CrashStage = 'effect' | 'terminal' | 'resume';
/**
 * 带崩溃断点的 AI 运行时夹具：包一层 `AiStore`，在快照写入后把命中的断点推给 `checkpoint`，
 * 让测试能在事务提交、进程尚未返回的瞬间杀掉自己。
 * `checkpoint` 只在最外层事务结束后调用，嵌套事务不会重复触发；`claim()` 直接领取一个
 * `ai_execution` 作业并返回租约，模拟 worker 的视角。
 */
export function recoveryRuntime(
  store: RecordStore,
  checkpoint?: (stage: CrashStage) => Promise<void>,
) {
  const base = createAiStore(store);
  const transaction = new AsyncLocalStorage<CrashStage[]>();
  const observe = async <K extends AiTable>(table: K, row: AiRecordMap[K], insert: boolean) => {
    const prior = table === 'ai_snapshots' ? await base.get('ai_snapshots', row.id) : undefined;
    const result = insert ? await base.insert(table, row) : await base.put(table, row);
    if (
      table === 'ai_snapshots' &&
      'workflow_name' in row.payload &&
      row.payload.workflow_name === 'recoverable'
    ) {
      if (row.status === 'success') transaction.getStore()?.push('terminal');
      if (prior?.status === 'suspended' && row.status === 'running')
        transaction.getStore()?.push('resume');
    }
    return result;
  };
  const ai: AiStore = {
    get: base.get.bind(base),
    list: base.list.bind(base),
    remove: base.remove.bind(base),
    insert: (table, row) => observe(table, row, true),
    put: (table, row) => observe(table, row, false),
    tx: async (work) => {
      if (transaction.getStore()) return base.tx(work);
      const stages: CrashStage[] = [];
      const result = await base.tx(() => transaction.run(stages, work));
      for (const stage of stages) await checkpoint?.(stage);
      return result;
    },
  };
  const value = z.object({ value: z.number() }).strict();
  const answer = z.object({ approved: z.boolean() }).strict();
  const registry = new OperationRegistry().register({
    id: 'recoverable',
    version: '1',
    title: 'Recovery',
    description: 'Recovery fixture',
    input: value,
    output: value,
    interactions: { approval: answer },
    create: (context) =>
      createWorkflow({
        id: 'recoverable',
        inputSchema: value,
        outputSchema: value,
        options: { autoRestartActiveRuns: false },
        retryConfig: { attempts: 0, delay: 0 },
      })
        .then(
          createStep({
            id: 'approval',
            inputSchema: value,
            outputSchema: value,
            resumeSchema: answer,
            suspendSchema: z.object({ question: z.string() }).strict(),
            execute: async ({ inputData, resumeData, suspend }) => {
              if (!resumeData) return suspend({ question: 'Continue?' });
              return { value: inputData.value + (resumeData.approved ? 1 : 0) };
            },
          }),
        )
        .then(
          createStep({
            id: 'commit-effect',
            inputSchema: value,
            outputSchema: value,
            execute: async ({ inputData }) => {
              const result = await context.effect('commit-once', inputData, async () => {
                await store.audit(context.ownerId, 'ai.recovery-effect', context.executionId);
                return inputData;
              });
              await checkpoint?.('effect');
              return result;
            },
          }),
        )
        .commit(),
  });
  const queue = new JobQueue(store);
  const runtime = new AiRuntime(
    ai,
    new HubAiQueue(store, queue),
    registry,
    {
      authorization: { authorize: async () => undefined },
      credentials: { resolve: async () => 'unused' },
      resources: {
        resolve: async () => {
          throw new Error('unused');
        },
      },
    },
    recoveryConfig,
  );
  const claim = async (): Promise<ExecutionLease> => {
    const job = await queue.claim('recovery-worker', ['ai_execution']);
    if (!job) throw new Error('No AI job');
    return {
      execution_id: job.aggregate_id,
      dispatch_id: job.id,
      owner: job.lease_owner!,
      epoch: job.lease_epoch,
      attempt: job.attempt,
    };
  };
  return { runtime, queue, claim, ai };
}
