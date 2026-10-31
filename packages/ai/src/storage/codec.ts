import { z } from 'zod';
import type { WorkflowRunState } from '@mastra/core/workflows';
import { asJson, type Json } from '../records.js';
import { AiError } from '../errors.js';

// 原生快照与 SDK 版本一起保存；边界 DTO 只允许 JSON，错误不保存供应商响应或堆栈。
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
  .passthrough();
export function decodeSnapshot(value: Json): WorkflowRunState {
  return snapshotSchema.parse(value) as unknown as WorkflowRunState;
}
