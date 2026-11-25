import { randomUUID } from 'node:crypto';
import type { z } from 'zod';
import type { AiConfiguration, ModelProfile } from '../core/config.js';
import { AiError, OutputRejectedError, type AiErrorCode } from '../core/errors.js';
import type { CredentialResolver } from '../core/ports.js';
import type { ExecutionRecord, ModelOutputCheck } from '../core/records.js';
import { ModelExchangeCapture } from '../integrations/model-exchange.js';
import {
  callShortModel,
  ShortModelError,
  type ShortModelCall,
  type ShortModelResult,
} from '../integrations/short-model.js';
import type { AiEventService } from './events.js';
import {
  abandonModelCalls,
  recordOutputCheck,
  reserveModelCall,
  settleModelCall,
  withdrawModelCall,
} from './model-calls.js';

/** 宿主对单次内联调用追加的验收与原文授权依据。 */
export interface InlineCallOptions<T> {
  /** 通过 Schema 后再核对业务规则；抛出 `OutputRejectedError` 即判为该调用的输出被拒。 */
  accept?: (value: T) => void | Promise<void>;
  /** 请求内容所属的主体版本，删除未发布版本时据此清理往返原文。 */
  subject?: string;
  /** 请求中出现其内容的其他固定版本；查看往返原文须能读取主体与全部这些版本。 */
  resources?: readonly string[];
}

/** 执行记录只含运行信息与结构化失败原因；往返原文按留存策略另存。 */
export interface InlineExecution {
  /** 执行记录在首次出站预留时分配，可在宿主的预留事务中关联业务阶段。 */
  readonly executionId?: string;
  call<S extends z.ZodType>(
    step: string,
    input: Omit<ShortModelCall<S>, 'profile' | 'credentials' | 'observer' | 'capture'> &
      InlineCallOptions<z.infer<S>>,
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

/**
 * 宿主异常也可能携带用户内容；只取固定分类。单次请求自身的时限属于端点失败，
 * 只有执行窗口到期或宿主报告的超时才记为执行超时。
 */
function failureCode(
  error: unknown,
  signal: AbortSignal,
  expired: boolean,
  requestScope = false,
): AiErrorCode {
  if (requestScope && error instanceof ShortModelError && error.reason !== 'cancelled')
    return error.code;
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

/** 运行时的固定说明与宿主规则说明可以落库，其余宿主异常只记错误码的通用说明。 */
function failureMessage(error: unknown, code: AiErrorCode) {
  if (code === 'AI_DEADLINE_EXCEEDED') return errorMessages[code];
  return (error instanceof ShortModelError || error instanceof OutputRejectedError) &&
    error.code === code
    ? error.message
    : errorMessages[code];
}

/** 运行中记录才可终结；超时回收与本地收尾在同一事务边界争用同一终态。 */
export async function finishInlineExecution(
  events: AiEventService,
  execution: ExecutionRecord,
  code: AiErrorCode | null,
  message = code ? errorMessages[code] : '',
  callId?: string,
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
  const error = { code, message, retryable: false };
  execution.payload.error = callId ? { ...error, call_id: callId } : error;
  if (execution.status === 'cancelled') await events.append(execution, 'execution.cancelled', {});
  else
    await events.append(execution, `execution.${execution.status}`, {
      error,
    });
}

/**
 * 出站与结算分属短事务，宿主回调成功返回后才结束执行。`retainExchanges` 为真时，
 * 每次请求的往返原文随调用结算一并写入，失败的请求也保留已收到的部分。
 */
export async function runInlineExecution<T>(
  events: AiEventService,
  config: AiConfiguration,
  profile: ModelProfile,
  credentials: CredentialResolver,
  operationId: string,
  retainExchanges: boolean,
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
  const failures = new WeakMap<AiError, { code: AiErrorCode; step: string; callId?: string }>();
  const startExecution = async (id: string) => {
    const execution = createExecution(id, deadline);
    await store.insert('ai_executions', execution);
    await events.append(execution, 'execution.started', {});
    return execution;
  };
  const expiredError = () => new ShortModelError('timeout');
  const assertWithinDeadline = (until = deadline) => {
    if (signal.aborted) throw new ShortModelError('cancelled');
    if (timeout.aborted || Date.now() >= until) throw expiredError();
  };
  const assertActive = (until = deadline) => {
    if (done.signal.aborted) throw new ShortModelError('cancelled');
    assertWithinDeadline(until);
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
      let callId: string | undefined;
      const endStep = async (code: AiErrorCode | null, check?: ModelOutputCheck) => {
        if (!executionId || started === undefined) return;
        const id = executionId;
        const start = started;
        const trace = await store.tx(async () => {
          const execution = await store.get('ai_executions', id);
          if (execution?.status !== 'running') {
            if (!code)
              throw execution?.status === 'timed_out'
                ? expiredError()
                : new ShortModelError('cancelled');
            return;
          }
          if (check && callId) await recordOutputCheck(store, execution, callId, check);
          if (code) {
            await events.append(execution, 'step.failed', { step_id: step, code });
            return;
          }
          const completed = await events.completeStep(execution, step, start);
          assertActive(execution.payload.deadline);
          if (callSignal.aborted) throw new ShortModelError('cancelled');
          return completed;
        });
        if (trace) events.notifyTrace(trace);
      };
      activeCalls++;
      const { reserve, release, accept, subject, resources, ...request } = input;
      const capture = retainExchanges ? new ModelExchangeCapture(profile.format) : undefined;
      let reserved = false;
      let sent = false;
      let received = false;
      let rejection: ModelOutputCheck | undefined;
      try {
        const result = await callShortModel({
          ...request,
          release: () => {
            if (reserved) release?.();
          },
          signal: callSignal,
          profile,
          credentials,
          capture,
          observer: {
            async start(diagnostics) {
              const id = (executionId ??= randomUUID());
              const pendingId = await store.tx(async () => {
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
              callId = pendingId;
              started = Date.now();
              return {
                executionId: id,
                finish: (settlement) =>
                  store.tx(async () => {
                    sent = settlement !== 'not_sent';
                    const execution = await store.get('ai_executions', id);
                    if (execution?.status !== 'running') return;
                    if (settlement === 'not_sent')
                      await withdrawModelCall(store, execution, pendingId);
                    else
                      await settleModelCall(
                        events,
                        execution,
                        pendingId,
                        settlement,
                        capture && {
                          subject: subject ?? '',
                          payload: capture.payload([
                            ...(subject ? [subject] : []),
                            ...(resources ?? []),
                          ]),
                        },
                      );
                  }),
              };
            },
          },
        });
        received = true;
        assertActive();
        try {
          await accept?.(result.value);
        } catch (error) {
          if (error instanceof OutputRejectedError && !failures.has(error))
            rejection = error.outputCheck();
          throw error;
        }
        await endStep(null, { status: 'accepted' });
        return result;
      } catch (error) {
        const requestFailure = sent && !received && error instanceof ShortModelError;
        const prior = error instanceof AiError ? failures.get(error) : undefined;
        const code = prior?.code ?? failureCode(error, callSignal, timeout.aborted, requestFailure);
        if (error instanceof AiError && !prior) {
          const attributed =
            (rejection && code === error.code) ||
            (requestFailure && code !== 'AI_CANCELLED' && code !== 'AI_DEADLINE_EXCEEDED');
          failures.set(error, { code, step, ...(attributed && callId && { callId }) });
        }
        await endStep(code, rejection);
        throw error;
      } finally {
        activeCalls--;
      }
    },
  };
  const terminateFailure = async (error: unknown) => {
    const failure = error instanceof AiError ? failures.get(error) : undefined;
    const code = failure?.code ?? failureCode(error, signal, timeout.aborted);
    const message = failureMessage(error, code);
    const configStep =
      !executionId &&
      error instanceof ShortModelError &&
      error.reason === 'configuration' &&
      code === 'AI_CONFIGURATION'
        ? failure?.step
        : undefined;
    if (!executionId && !configStep) return;
    const id = executionId ?? randomUUID();
    await store.tx(async () => {
      if (configStep) {
        // 配置阻断了已发起的操作，但网络请求尚不存在，不预留调用或推算用量。
        const execution = await startExecution(id);
        await events.append(execution, 'step.started', { step_id: configStep });
        await events.append(execution, 'step.failed', {
          step_id: configStep,
          code: 'AI_CONFIGURATION',
        });
        await finishInlineExecution(events, execution, 'AI_CONFIGURATION', message);
        return;
      }
      const execution = await store.get('ai_executions', id);
      if (execution) await finishInlineExecution(events, execution, code, message, failure?.callId);
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
          throw execution?.status === 'timed_out'
            ? expiredError()
            : new ShortModelError('cancelled');
        assertWithinDeadline(execution?.payload.deadline);
        // 宿主的持久化结果与成功事件共用事务，结算期间超时或取消则一并回滚。
        if (execution) await finishInlineExecution(events, execution, null);
        await onSuccess?.(result);
        assertWithinDeadline(execution?.payload.deadline);
      });
    return result;
  } catch (error) {
    done.abort();
    await terminateFailure(error);
    throw error;
  }
}
