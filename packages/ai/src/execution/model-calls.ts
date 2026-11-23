import { randomUUID } from 'node:crypto';
import { AiError, type AiErrorCode } from '../core/errors.js';
import type { AiStore } from '../core/ports.js';
import type { ExecutionRecord, ModelCallDiagnostics } from '../core/records.js';
import type { AiEventService } from './events.js';

/** 用量缺项以 null 传递；端点明确报告的零和未知不能互换。 */
export interface ModelCallSettlement {
  transport: NonNullable<ModelCallDiagnostics['transport']>;
  inputTokens: number | null;
  outputTokens: number | null;
  complete: boolean;
  errorCode: AiErrorCode | null;
}

/** 调用方在同一事务内取得当前执行并核验写入资格，每次真实出站仅预留一次。 */
export async function reserveModelCall(
  store: AiStore,
  execution: ExecutionRecord,
  diagnostics: ModelCallDiagnostics,
  maxRequests: number,
) {
  if (execution.payload.usage.requests >= maxRequests)
    throw new AiError('AI_BUDGET_EXCEEDED', '模型请求次数已达到上限');
  const now = new Date().toISOString();
  const id = randomUUID();
  execution.payload.usage.requests++;
  await store.put('ai_executions', execution);
  await store.insert('ai_calls', {
    id,
    owner_id: execution.owner_id,
    execution_id: execution.id,
    lookup_key: execution.id,
    status: 'pending',
    position: execution.payload.usage.requests,
    created_at: now,
    updated_at: now,
    payload: {
      attempt: execution.payload.attempt,
      profile: execution.payload.model_profile,
      diagnostics,
      input_tokens: 0,
      output_tokens: 0,
      error_code: null,
      duration_ms: 0,
    },
  });
  return id;
}

/** 仅在尚未调用 fetch 时撤回自己的预留；传输失败和进程中断均不能据此退款。 */
export async function withdrawModelCall(
  store: AiStore,
  execution: ExecutionRecord,
  callId: string,
) {
  const call = await store.get('ai_calls', callId);
  if (!call || call.execution_id !== execution.id || call.status !== 'pending') return;
  await store.remove('ai_calls', callId);
  execution.payload.usage.requests--;
  await store.put('ai_executions', execution);
}

/** 仅结算仍待确认的调用；不完整的值留在诊断中，不进入已确认 Token 汇总。 */
export async function settleModelCall(
  events: AiEventService,
  execution: ExecutionRecord,
  callId: string,
  result: ModelCallSettlement,
) {
  const call = await events.store.get('ai_calls', callId);
  if (!call || call.status !== 'pending' || call.execution_id !== execution.id) return;
  const known = result.complete && result.inputTokens !== null && result.outputTokens !== null;
  call.status = known ? 'succeeded' : result.errorCode ? 'failed' : 'unknown';
  call.updated_at = new Date().toISOString();
  call.payload.diagnostics.transport = result.transport;
  call.payload.duration_ms = Date.now() - Date.parse(call.created_at);
  call.payload.error_code = result.errorCode;
  call.payload.input_tokens = result.inputTokens ?? 0;
  call.payload.output_tokens = result.outputTokens ?? 0;
  if (known) {
    execution.payload.usage.input_tokens += call.payload.input_tokens;
    execution.payload.usage.output_tokens += call.payload.output_tokens;
  } else execution.payload.usage.unknown_requests++;
  await events.store.put('ai_calls', call);
  await events.append(execution, 'usage.updated', { ...execution.payload.usage });
}

/** 崩溃或中断后不补发模型请求；调用者的后续事件在同一事务内保存累计用量。 */
export async function abandonModelCalls(
  store: AiStore,
  execution: ExecutionRecord,
  endedAt?: string,
) {
  const pending = await store.list('ai_calls', {
    execution_id: execution.id,
    status: 'pending',
    limit: 500,
  });
  const end = endedAt ? Date.parse(endedAt) : 0;
  for (const call of pending) {
    call.status = 'unknown';
    // 恢复者不知道传输何时中断，不能把停机时间计为请求耗时。
    if (endedAt) {
      call.updated_at = endedAt;
      call.payload.duration_ms = end - Date.parse(call.created_at);
    }
    execution.payload.usage.unknown_requests++;
    await store.put('ai_calls', call);
  }
}
