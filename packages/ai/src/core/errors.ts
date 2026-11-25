import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { MastraError } from '@mastra/core/error';
import type { ModelOutputCheck } from './records.js';

/**
 * AI 层错误码，`AiError.code` 一律取这里的值，宿主据此映射 HTTP 状态与是否可重试：
 * `AI_REVISION_CONFLICT`/`AI_CONFLICT` 属于并发冲突（调用方需重新读取），`AI_LEASE_LOST`
 * 表示调度权已被替换（不能继续写库），`AI_RECOVERY_UNCERTAIN` 表示恢复期的证据不足或对不上，
 * `AI_INTERRUPTED` 是可在期限内重排的唯一信号。
 */
export type AiErrorCode =
  | 'AI_CONFIGURATION'
  | 'AI_NOT_FOUND'
  | 'AI_FORBIDDEN'
  | 'AI_CONFLICT'
  | 'AI_REVISION_CONFLICT'
  | 'AI_LEASE_LOST'
  | 'AI_BUDGET_EXCEEDED'
  | 'AI_DEADLINE_EXCEEDED'
  | 'AI_PROVIDER_FAILED'
  | 'AI_STREAM_INCOMPLETE'
  | 'AI_OUTPUT_INVALID'
  | 'AI_RECOVERY_UNCERTAIN'
  | 'AI_CANCELLED'
  | 'AI_INTERRUPTED'
  | 'AI_INTERNAL';

const workflowErrors = new AsyncLocalStorage<Map<string, AiError>>();

/** SDK 会把终止异常复制成普通对象；只认本轮签发的标识，不从副本采信消息或错误码。 */
export function withWorkflowErrors<T>(work: () => Promise<T>): Promise<T> {
  return workflowErrors.getStore() ? work() : workflowErrors.run(new Map(), work);
}

/**
 * AI 层的统一异常。`message` 会原样写入执行记录并可能回传给调用方，因此只允许放可公开的说明，
 * 不得包含凭据、模型原文或供应商响应。`retryable` 只是给宿主的提示，运行时不会据此自动重试。
 */
export class AiError extends Error {
  callId?: string;
  #workflowErrorId?: string;
  constructor(
    readonly code: AiErrorCode,
    message: string,
    readonly retryable = false,
  ) {
    super(message);
    this.name = 'AiError';
  }
  /** 只在工作流复制错误时登记原异常；非工作流的 JSON 序列化仍沿用自身可枚举字段。 */
  toJSON() {
    const errors = workflowErrors.getStore();
    if (!errors) return this;
    const workflowErrorId = (this.#workflowErrorId ??= randomUUID());
    errors.set(workflowErrorId, this);
    return { name: 'Error', message: 'AI execution failed', workflowErrorId };
  }
}

/**
 * 宿主规则拒绝一次调用的结果。`rule` 是固定规则标识，`message` 是宿主写定的说明，
 * `facts` 只放期望值、实际值等数值；三者会写入调用记录，不得包含模型原文或资源内容。
 */
export class OutputRejectedError extends AiError {
  constructor(
    readonly rule: string,
    message: string,
    readonly facts: Record<string, number | boolean> = {},
  ) {
    super('AI_OUTPUT_INVALID', message);
    this.name = 'OutputRejectedError';
  }
  /** 只有规则标识、固定说明及有界数值可进入调用诊断。 */
  outputCheck(): ModelOutputCheck {
    const facts = Object.fromEntries(
      Object.entries(this.facts).filter(
        ([key, value]) =>
          /^[a-z_]{1,40}$/u.test(key) && (typeof value === 'boolean' || Number.isFinite(value)),
      ),
    );
    return {
      status: 'rejected',
      reason: 'host_rejected',
      message: this.message.slice(0, 200),
      ...(/^[a-z][a-z0-9-]{0,63}$/u.test(this.rule) && { rule: this.rule }),
      ...(Object.keys(facts).length ? { facts } : {}),
    };
  }
}

/**
 * 把任意异常收敛为 {@link AiError}：Mastra 的结构化输出类错误统一改成 `AI_OUTPUT_INVALID`
 * （原文可能含模型输出，消息固定为中文说明），其它异常一律降级为 `AI_INTERNAL`，避免内部堆栈
 * 或供应商响应外泄。已是的 `AiError` 原样返回。
 */
export function aiFailure(error: unknown): AiError {
  const errors = workflowErrors.getStore();
  if (errors) {
    let cause = error;
    for (let depth = 0; depth <= 5 && cause && typeof cause === 'object'; depth++) {
      if (cause instanceof AiError) return cause;
      if ('workflowErrorId' in cause && typeof cause.workflowErrorId === 'string') {
        const original = errors.get(cause.workflowErrorId);
        if (original) return original;
      }
      cause = 'cause' in cause ? cause.cause : undefined;
    }
  }
  if (error instanceof MastraError) {
    const messages: Record<string, string> = {
      STRUCTURED_OUTPUT_SCHEMA_VALIDATION_FAILED: '模型结构化结果的字段或类型不符合约定',
      STRUCTURED_OUTPUT_OBJECT_UNDEFINED: '模型未生成结构化结果',
      STRUCTURED_OUTPUT_TRUNCATED: '模型结构化结果因输出长度限制被截断',
    };
    const message = messages[error.id];
    if (message) return new AiError('AI_OUTPUT_INVALID', message);
  }
  return error instanceof AiError ? error : new AiError('AI_INTERNAL', 'AI 执行失败');
}
