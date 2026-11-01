import { z } from 'zod';
import type { WorkflowRunState } from '@mastra/core/workflows';
import { asJson, type Json } from '../core/records.js';
import { AiError } from '../core/errors.js';

// 原生快照与 SDK 版本一起保存；边界 DTO 只允许 JSON，错误不保存供应商响应或堆栈。

/**
 * 把原生工作流快照编码成可落库的 JSON：`Error` 被替换成不含 message 的占位对象，`bigint`/函数/符号
 * 直接拒绝而不是被丢弃（丢字段会让快照无法恢复）。序列化后上限 4 MB，超出即
 * `AI_OUTPUT_INVALID`。边界上只允许 JSON，因此供应商响应与堆栈不会进入持久层。
 */
export function encodeNative(value: unknown): Json {
  const text = JSON.stringify(value, (_key, item: unknown) => {
    if (item instanceof Error) return { name: 'Error', message: 'AI execution failed' };
    if (typeof item === 'bigint' || typeof item === 'function' || typeof item === 'symbol')
      throw new AiError('AI_OUTPUT_INVALID', '持久化内容必须为 JSON');
    return item;
  });
  if (!text || Buffer.byteLength(text) > 4_000_000)
    throw new AiError('AI_OUTPUT_INVALID', '持久化内容超过限制');
  return asJson(JSON.parse(text));
}
const snapshotSchema = z
  .object({
    runId: z.string(),
    status: z.string(),
    context: z.record(z.string(), z.unknown()),
    timestamp: z.number(),
  })
  .loose();

/**
 * 把落库快照还原成 SDK 的 `WorkflowRunState`：只校验 `runId`/`status`/`context`/`timestamp` 这几个
 * 恢复必需字段，其余字段原样透传（SDK 版本升级后形状可能变化，这里不做封闭校验）。
 */
export function decodeSnapshot(value: Json): WorkflowRunState {
  return snapshotSchema.parse(value) as unknown as WorkflowRunState;
}
