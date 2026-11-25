import { randomInt, randomUUID } from 'node:crypto';
import { setTimeout as waitDelay } from 'node:timers/promises';
import type { z } from 'zod';
import type { AiConfiguration, ModelProfile } from '../core/config.js';
import { AiError, OutputRejectedError, type AiErrorCode } from '../core/errors.js';
import type { CredentialResolver } from '../core/ports.js';
import type {
  ExecutionRecord,
  ModelCallRecoveryReason,
  ModelOutputCheck,
} from '../core/records.js';
import { ModelExchangeCapture } from '../integrations/model-exchange.js';
import {
  callShortModel,
  ShortModelError,
  shortModelLimits,
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
  /** 可选追加请求与调用账本共用预留事务；拒绝额度时保留初次失败。 */
  recovery?: { deadline?: number; reserve: () => Promise<boolean> };
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

/**
 * 只有已收到的输出不合格才算单个样本失败；传输、超时、授权、期限、租约与额度问题
 * 反映端点或运行环境状态，继续发送其余样本只会扩大消耗，须结束所在阶段。
 */
export function isModelSampleFailure(
  error: unknown,
): error is ShortModelError | OutputRejectedError {
  if (error instanceof OutputRejectedError) return true;
  return (
    error instanceof ShortModelError &&
    (error.reason === 'invalid_output' || error.reason === 'output_too_large') &&
    error.code === 'AI_OUTPUT_INVALID'
  );
}

interface CallRecovery {
  reason: ModelCallRecoveryReason;
  hint?: string;
  delayMs: number;
}

const transientConnections: Record<string, true> = {
  EAI_AGAIN: true,
  ECONNREFUSED: true,
  ECONNRESET: true,
  EPIPE: true,
  UND_ERR_SOCKET: true,
};

function planRecovery(error: AiError, rejection?: ModelOutputCheck): CallRecovery | undefined {
  const details = error instanceof ShortModelError ? error.details : undefined;
  const check = rejection ?? details?.check;
  switch (check?.reason) {
    case 'empty_output':
    case 'invalid_json':
      return { reason: check.reason, hint: '仅返回完整的 JSON 对象。', delayMs: 0 };
    case 'output_limit':
      return {
        reason: check.reason,
        hint: '输出紧凑 JSON，删除重复说明但保留必要事实。',
        delayMs: 0,
      };
    case 'schema_mismatch': {
      const rules = check.issues
        ?.slice(0, 8)
        .map(({ path, code, expected, limit }) => {
          const requirement = expected ?? limit;
          return `${path}: ${code}${requirement === undefined ? '' : ' ' + requirement}`;
        })
        .join('；');
      return {
        reason: check.reason,
        hint: rules ? `按 Schema 修正这些字段：${rules}。` : '逐项核对 Schema 的字段和类型。',
        delayMs: 0,
      };
    }
    case 'host_rejected':
      return {
        reason: check.reason,
        hint: check.message ?? '仅采用本次资料中的候选和证据，核对业务规则。',
        delayMs: 0,
      };
    case 'content_filter':
    case 'response_too_large':
      return;
  }
  if (
    error instanceof ShortModelError &&
    (error.reason === 'provider' || error.reason === 'rate_limited')
  ) {
    const status = details?.httpStatus;
    const reason =
      status === 429
        ? 'rate_limited'
        : status === 500 || status === 502 || status === 503
          ? 'http_error'
          : status === undefined &&
              details?.networkError &&
              Object.hasOwn(transientConnections, details.networkError)
            ? 'network'
            : undefined;
    const minimum = Math.max(2_000, details?.retryAfterMs ?? 0);
    if (reason && minimum <= 8_000)
      return { reason, delayMs: randomInt(minimum, Math.min(minimum + 1_000, 8_000) + 1) };
  }
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
  // 预留事务回滚时执行记录也随之撤销；只有提交过的执行才能在结束时核对和收尾。
  let stored = false;
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
      const { recovery, reserve, release, accept, subject, resources, ...request } = input;
      let latestStart = 0;
      let followup: CallRecovery | undefined;
      const once = async (retry?: { plan: CallRecovery; firstError: unknown }) => {
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
        const capture = retainExchanges ? new ModelExchangeCapture(profile.format) : undefined;
        let reserved = false;
        let sent = false;
        let received = false;
        let rejection: ModelOutputCheck | undefined;
        try {
          const result = await callShortModel({
            ...request,
            instructions: retry?.plan.hint
              ? `${request.instructions}\n只根据本次资料与 Schema 纠正输出，不补造证据。${retry.plan.hint}`
              : request.instructions,
            release: () => {
              if (reserved) release?.();
            },
            signal: callSignal,
            profile,
            credentials,
            capture,
            observer: {
              async start(diagnostics, requestSignal) {
                const id = (executionId ??= randomUUID());
                const pendingId = await store.tx(async () => {
                  assertActive();
                  if (callSignal.aborted) throw new ShortModelError('cancelled');
                  const execution =
                    (await store.get('ai_executions', id)) ?? (await startExecution(id));
                  if (execution.status !== 'running') throw new ShortModelError('cancelled');
                  if (
                    retry &&
                    (Date.now() >= latestStart ||
                      execution.payload.usage.requests >= config.max_requests)
                  )
                    throw retry.firstError;
                  const event = await events.append(execution, 'step.started', { step_id: step });
                  const pending = await reserveModelCall(
                    store,
                    execution,
                    {
                      ...diagnostics,
                      agent_id: operationId,
                      step: { id: step, start_seq: event.payload.seq },
                      ...(retry && { recovery_reason: retry.plan.reason }),
                    },
                    config.max_requests,
                  );
                  // 宿主拒绝预留必须回滚同一事务内的步骤与账本，不能把可选重问写成任务延期。
                  if (retry) {
                    if (!(await recovery?.reserve())) throw retry.firstError;
                    if (Date.now() >= latestStart) throw retry.firstError;
                  } else await reserve?.();
                  reserved = true;
                  assertActive();
                  callSignal.throwIfAborted();
                  // 等锁期间单次请求可能已到时限，此时回滚预留，不让宿主额度记下不会出站的请求。
                  requestSignal.throwIfAborted();
                  return pending;
                });
                stored = true;
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
          // 追加请求没有出站时以原失败结束；执行已取消或到期时仍按执行状态收敛。
          if (
            retry &&
            !sent &&
            error instanceof ShortModelError &&
            !callSignal.aborted &&
            Date.now() < deadline
          )
            throw retry.firstError;
          const requestFailure = sent && !received && error instanceof ShortModelError;
          const prior = error instanceof AiError ? failures.get(error) : undefined;
          const code =
            prior?.code ?? failureCode(error, callSignal, timeout.aborted, requestFailure);
          if (error instanceof AiError && !prior) {
            const attributed =
              (rejection && code === error.code) ||
              (requestFailure && code !== 'AI_CANCELLED' && code !== 'AI_DEADLINE_EXCEEDED');
            failures.set(error, { code, step, ...(attributed && callId && { callId }) });
          }
          await endStep(code, rejection);
          if (
            !retry &&
            !prior &&
            recovery &&
            !request.onPartial &&
            error instanceof AiError &&
            (requestFailure || rejection)
          )
            followup = planRecovery(error, rejection);
          throw error;
        }
      };
      activeCalls++;
      try {
        return await once();
      } catch (error) {
        const plan = followup;
        if (!plan || callSignal.aborted) throw error;
        latestStart =
          Math.min(deadline, recovery?.deadline ?? deadline) -
          shortModelLimits(profile, request.limits, request.operation).timeoutMs;
        if (Date.now() + plan.delayMs >= latestStart) throw error;
        if (plan.delayMs) {
          try {
            await waitDelay(plan.delayMs, undefined, { signal: callSignal });
          } catch (failure) {
            if (!callSignal.aborted) throw failure;
            const code = failureCode(failure, callSignal, timeout.aborted);
            throw code === 'AI_DEADLINE_EXCEEDED'
              ? expiredError()
              : new ShortModelError('cancelled');
          }
          if (Date.now() >= latestStart) throw error;
        }
        return await once({ plan, firstError: error });
      } finally {
        activeCalls--;
      }
    },
  };
  const terminateFailure = async (error: unknown) => {
    const failure = error instanceof AiError ? failures.get(error) : undefined;
    const code = failure?.code ?? failureCode(error, signal, timeout.aborted);
    const message = failureMessage(error, code);
    // 宿主提前退出时，并行调用的首笔预留可能仍在提交；这时须在事务内核对执行是否存在。
    const existingId = stored || activeCalls > 0 ? executionId : undefined;
    const configStep =
      !existingId &&
      error instanceof ShortModelError &&
      error.reason === 'configuration' &&
      code === 'AI_CONFIGURATION'
        ? failure?.step
        : undefined;
    if (!existingId && !configStep) return;
    const id = existingId ?? randomUUID();
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
    const id = stored ? executionId : undefined;
    if (id || onSuccess)
      await store.tx(async () => {
        const execution = id ? await store.get('ai_executions', id) : undefined;
        if (id && execution?.status !== 'running')
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
