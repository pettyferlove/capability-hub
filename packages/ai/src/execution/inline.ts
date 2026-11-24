import { randomUUID } from 'node:crypto';
import type { z } from 'zod';
import type { AiConfiguration, ModelProfile } from '../core/config.js';
import { AiError, type AiErrorCode } from '../core/errors.js';
import type { CredentialResolver } from '../core/ports.js';
import type { ExecutionRecord } from '../core/records.js';
import {
  callShortModel,
  ShortModelError,
  type ShortModelCall,
  type ShortModelResult,
} from '../integrations/short-model.js';
import type { AiEventService } from './events.js';
import {
  abandonModelCalls,
  reserveModelCall,
  settleModelCall,
  withdrawModelCall,
} from './model-calls.js';

/** 业务内容不落库；reserve 在调用账本的写事务内执行，只能核对本地授权和配额。 */
export interface InlineExecution {
  /** 执行记录在首次出站预留时分配，可在宿主的预留事务中关联业务阶段。 */
  readonly executionId?: string;
  call<S extends z.ZodType>(
    step: string,
    input: Omit<ShortModelCall<S>, 'profile' | 'credentials' | 'observer'>,
  ): Promise<ShortModelResult<z.infer<S>>>;
}

const errorMessages: Record<AiErrorCode, string> = {
  AI_CONFIGURATION: '模型配置或凭据不可用',
  AI_NOT_FOUND: '执行依据不可用',
  AI_FORBIDDEN: '执行授权已失效',
  AI_CONFLICT: '执行状态已改变',
  AI_REVISION_CONFLICT: '修订号已改变',
  AI_LEASE_LOST: '执行租约已失效',
  AI_BUDGET_EXCEEDED: '执行已达到预算上限',
  AI_DEADLINE_EXCEEDED: '执行已超过时限',
  AI_PROVIDER_FAILED: '模型端点请求失败',
  AI_STREAM_INCOMPLETE: '模型传输不完整',
  AI_OUTPUT_INVALID: '模型结构化结果不符合约定',
  AI_RECOVERY_UNCERTAIN: '执行未能恢复',
  AI_CANCELLED: '执行已取消',
  AI_INTERRUPTED: '执行已中断',
  AI_INTERNAL: 'AI 执行失败',
};

/** 宿主异常也可能携带用户内容；只取固定分类，不持久化异常消息或 cause。 */
function failureCode(error: unknown, signal: AbortSignal, expired: boolean): AiErrorCode {
  if (signal.aborted) {
    const reason: unknown = signal.reason;
    return (reason instanceof Error && reason.name === 'TimeoutError') ||
      (reason instanceof AiError && reason.code === 'AI_DEADLINE_EXCEEDED')
      ? 'AI_DEADLINE_EXCEEDED'
      : 'AI_CANCELLED';
  }
  if (expired || (error instanceof ShortModelError && error.reason === 'timeout'))
    return 'AI_DEADLINE_EXCEEDED';
  return error instanceof AiError && Object.hasOwn(errorMessages, error.code)
    ? error.code
    : 'AI_INTERNAL';
}

/** 运行中记录才可终结；超时回收与本地收尾在同一事务边界争用同一终态。 */
export async function finishInlineExecution(
  events: AiEventService,
  execution: ExecutionRecord,
  code: AiErrorCode | null,
) {
  if (execution.status !== 'running' || execution.payload.execution_mode !== 'inline') return;
  execution.payload.revision++;
  if (code === null) {
    execution.status = 'succeeded';
    await events.append(execution, 'execution.completed', { result: null });
    return;
  }
  await abandonModelCalls(events.store, execution);
  execution.status =
    code === 'AI_DEADLINE_EXCEEDED'
      ? 'timed_out'
      : code === 'AI_CANCELLED'
        ? 'cancelled'
        : 'failed';
  execution.payload.error = { code, message: errorMessages[code], retryable: false };
  if (execution.status === 'cancelled') await events.append(execution, 'execution.cancelled', {});
  else
    await events.append(execution, `execution.${execution.status}`, {
      error: execution.payload.error,
    });
}

/** 出站与结算分属短事务，宿主回调成功返回后才结束执行。 */
export async function runInlineExecution<T>(
  events: AiEventService,
  config: AiConfiguration,
  profile: ModelProfile,
  credentials: CredentialResolver,
  operationId: string,
  signal: AbortSignal,
  createExecution: (id: string, deadline: number) => ExecutionRecord,
  work: (run: InlineExecution) => Promise<T>,
  onSuccess?: (result: T) => Promise<void>,
): Promise<T> {
  const { store } = events;
  const timeoutMs = Math.min(config.active_timeout_ms, config.execution_timeout_ms);
  const deadline = Date.now() + timeoutMs;
  const timeout = AbortSignal.timeout(timeoutMs);
  const done = new AbortController();
  const runSignal = AbortSignal.any([signal, timeout, done.signal]);
  let executionId: string | undefined;
  let activeCalls = 0;
  let lastFailure: { error: unknown; code: AiErrorCode; step: string } | undefined;
  const startExecution = async (id: string) => {
    const execution = createExecution(id, deadline);
    await store.insert('ai_executions', execution);
    await events.append(execution, 'execution.started', {});
    return execution;
  };
  const assertWithinDeadline = (until = deadline) => {
    if (signal.aborted) throw new ShortModelError('cancelled');
    if (timeout.aborted || Date.now() >= until) throw new ShortModelError('timeout');
  };
  const assertActive = () => {
    if (done.signal.aborted) throw new ShortModelError('cancelled');
    assertWithinDeadline();
  };
  const run: InlineExecution = {
    get executionId() {
      return executionId;
    },
    async call(step, input) {
      assertActive();
      if (!/^[a-z][a-z0-9-]{0,63}$/.test(step))
        throw new AiError('AI_CONFIGURATION', '内联操作步骤标识无效');
      const callSignal = input.signal ? AbortSignal.any([input.signal, runSignal]) : runSignal;
      let started: number | undefined;
      const endStep = async (code: AiErrorCode | null) => {
        if (!executionId || started === undefined) return;
        const id = executionId;
        const start = started;
        const trace = await store.tx(async () => {
          const execution = await store.get('ai_executions', id);
          if (execution?.status !== 'running') {
            if (!code)
              throw new ShortModelError(
                execution?.status === 'timed_out' ? 'timeout' : 'cancelled',
              );
            return;
          }
          if (code) await events.append(execution, 'step.failed', { step_id: step, code });
          else return events.completeStep(execution, step, start);
        });
        if (trace) events.notifyTrace(trace);
      };
      activeCalls++;
      const { reserve, release, ...request } = input;
      let reserved = false;
      try {
        const result = await callShortModel({
          ...request,
          release: () => {
            if (reserved) release?.();
          },
          signal: callSignal,
          profile,
          credentials,
          observer: {
            async start(diagnostics) {
              const id = (executionId ??= randomUUID());
              const callId = await store.tx(async () => {
                assertActive();
                if (callSignal.aborted) throw new ShortModelError('cancelled');
                const execution =
                  (await store.get('ai_executions', id)) ?? (await startExecution(id));
                if (execution.status !== 'running') throw new ShortModelError('cancelled');
                const event = await events.append(execution, 'step.started', { step_id: step });
                const pending = await reserveModelCall(
                  store,
                  execution,
                  {
                    ...diagnostics,
                    agent_id: operationId,
                    step: { id: step, start_seq: event.payload.seq },
                  },
                  config.max_requests,
                );
                // 宿主在同一写事务内授权实际出站内容；拒绝会回滚执行、步骤和调用预留。
                await reserve?.();
                reserved = true;
                assertActive();
                callSignal.throwIfAborted();
                return pending;
              });
              started = Date.now();
              return {
                executionId: id,
                finish: (settlement) =>
                  store.tx(async () => {
                    const execution = await store.get('ai_executions', id);
                    if (execution?.status !== 'running') return;
                    if (settlement === 'not_sent')
                      await withdrawModelCall(store, execution, callId);
                    else await settleModelCall(events, execution, callId, settlement);
                  }),
              };
            },
          },
        });
        assertActive();
        await endStep(null);
        return result;
      } catch (error) {
        const code = failureCode(error, callSignal, timeout.aborted);
        lastFailure = { error, code, step };
        await endStep(code);
        throw error;
      } finally {
        activeCalls--;
      }
    },
  };
  const terminateFailure = async (code: AiErrorCode) => {
    const configFailure =
      !executionId &&
      lastFailure?.error instanceof ShortModelError &&
      lastFailure.error.reason === 'configuration' &&
      lastFailure.code === 'AI_CONFIGURATION' &&
      !signal.aborted &&
      !timeout.aborted
        ? lastFailure
        : undefined;
    if (!executionId && !configFailure) return;
    const id = executionId ?? randomUUID();
    await store.tx(async () => {
      if (configFailure) {
        // 配置阻断了已发起的操作，但网络请求尚不存在，不预留调用或推算用量。
        const execution = await startExecution(id);
        await events.append(execution, 'step.started', { step_id: configFailure.step });
        await events.append(execution, 'step.failed', {
          step_id: configFailure.step,
          code: 'AI_CONFIGURATION',
        });
        await finishInlineExecution(events, execution, 'AI_CONFIGURATION');
        return;
      }
      const execution = await store.get('ai_executions', id);
      if (execution) await finishInlineExecution(events, execution, code);
    });
  };
  try {
    assertActive();
    const result = await work(run);
    assertActive();
    if (activeCalls) throw new AiError('AI_INTERNAL', '宿主未等待内联模型调用结束');
    done.abort();
    if (executionId || onSuccess)
      await store.tx(async () => {
        const execution = executionId ? await store.get('ai_executions', executionId) : undefined;
        if (executionId && execution?.status !== 'running')
          throw new ShortModelError(execution?.status === 'timed_out' ? 'timeout' : 'cancelled');
        assertWithinDeadline(execution?.payload.deadline);
        // 宿主的持久化结果与成功事件共用事务，结算期间超时或取消则一并回滚。
        if (execution) await finishInlineExecution(events, execution, null);
        await onSuccess?.(result);
        assertWithinDeadline(execution?.payload.deadline);
      });
    return result;
  } catch (error) {
    done.abort();
    const code =
      lastFailure && error === lastFailure.error && !signal.aborted && !timeout.aborted
        ? lastFailure.code
        : failureCode(error, signal, timeout.aborted);
    await terminateFailure(code);
    throw error;
  }
}
