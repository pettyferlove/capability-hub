import {
  aiExecutionResponseSchema,
  aiExecutionViewResponseSchema,
} from '@capability-hub/contracts';
import type { AiRuntime, ExecutionRecord } from '@capability-hub/ai';

export function executionResponse(row: ExecutionRecord) {
  const payload = row.payload;
  return aiExecutionResponseSchema.parse({
    id: row.id,
    owner_id: row.owner_id,
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
    operation_id: payload.operation_id,
    model_profile: payload.model_profile,
    revision: payload.revision,
    attempt: payload.attempt,
    continuation: payload.continuation,
    input: payload.input,
    result: payload.result,
    deadline: payload.deadline,
    last_seq: payload.last_seq,
    message_text: payload.message_text,
    message_blocks: payload.message_blocks,
    usage: payload.usage,
    error: payload.error,
  });
}
export function executionView(view: Awaited<ReturnType<AiRuntime['view']>>) {
  return aiExecutionViewResponseSchema.parse({
    execution: executionResponse(view.execution),
    watermark: view.watermark,
    activity: view.activity.map((row) => ({ ...row.payload, execution_id: row.execution_id })),
    activity_truncated: view.activity_truncated,
    interactions: view.interactions.map((row) => ({
      id: row.id,
      status: row.status,
      revision: row.payload.revision,
      request: row.payload.request,
      response_schema: row.payload.response_schema,
      response: row.payload.response,
      expires_at: row.payload.expires_at,
    })),
    artifacts: view.artifacts
      .filter((row) => !row.payload.name.startsWith('resource:'))
      .map((row) => ({ id: row.id, ...row.payload })),
  });
}
