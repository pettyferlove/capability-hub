import { z } from 'zod';

export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };
export const jsonSchema: z.ZodType<Json> = z.json();
const id = z.string().min(1).max(200);
const date = z.iso.datetime();
const base = {
  id,
  owner_id: id,
  execution_id: id,
  lookup_key: z.string().max(512),
  position: z.number().int().nonnegative(),
  status: z.string().min(1).max(80),
  created_at: date,
  updated_at: date,
};
export const executionStatusSchema = z.enum([
  'queued',
  'running',
  'waiting_input',
  'succeeded',
  'failed',
  'cancelled',
  'timed_out',
]);
export const terminalStatuses = new Set(['succeeded', 'failed', 'cancelled', 'timed_out']);
export const executionPayloadSchema = z
  .object({
    operation_id: id,
    definition_version: id,
    definition_digest: id,
    model_profile: id,
    model_digest: id,
    input: jsonSchema,
    result: jsonSchema.nullable(),
    revision: z.number().int().positive(),
    attempt: z.number().int().nonnegative(),
    continuation: z.number().int().nonnegative(),
    dispatch_id: id.nullable(),
    native_run_id: id,
    native_workflow_id: id,
    deadline: z.number().int().positive(),
    last_seq: z.number().int().nonnegative(),
    event_bytes: z.number().int().nonnegative(),
    message_text: z.string().max(1_000_000),
    message_blocks: z
      .array(
        z
          .object({
            id: z.string(),
            message_id: z.string(),
            text: z.string(),
            complete: z.boolean(),
          })
          .strict(),
      )
      .max(200),
    error: z
      .object({ code: z.string(), message: z.string(), retryable: z.boolean() })
      .strict()
      .nullable(),
    usage: z
      .object({
        requests: z.number().int().nonnegative(),
        tools: z.number().int().nonnegative(),
        input_tokens: z.number().nonnegative(),
        output_tokens: z.number().nonnegative(),
        unknown_requests: z.number().int().nonnegative(),
      })
      .strict(),
  })
  .strict();
export const executionRecordSchema = z
  .object({ ...base, status: executionStatusSchema, payload: executionPayloadSchema })
  .strict();
export type ExecutionRecord = z.infer<typeof executionRecordSchema>;

export const eventTypes = [
  'execution.queued',
  'execution.started',
  'execution.waiting_input',
  'execution.completed',
  'execution.failed',
  'execution.cancelled',
  'execution.timed_out',
  'execution.retry_scheduled',
  'step.started',
  'step.completed',
  'step.failed',
  'message.started',
  'message.delta',
  'message.completed',
  'tool.started',
  'tool.completed',
  'tool.failed',
  'interaction.requested',
  'interaction.responded',
  'usage.updated',
  'artifact.created',
] as const;
export const eventRecordSchema = z
  .object({
    ...base,
    payload: z
      .object({
        schema_version: z.literal(1),
        audience: z.enum(['operator', 'admin']),
        seq: z.number().int().positive(),
        type: z.enum(eventTypes),
        attempt: z.number().int().nonnegative(),
        continuation: z.number().int().nonnegative(),
        occurred_at: date,
        data: z.record(z.string(), jsonSchema),
      })
      .strict(),
  })
  .strict();
export type AiEventType = (typeof eventTypes)[number];
export type AiEvent = z.infer<typeof eventRecordSchema>;
export const snapshotRecordSchema = z
  .object({
    ...base,
    payload: z
      .object({
        workflow_name: id,
        run_id: id,
        sdk_version: z.literal('1.81.0'),
        definition_digest: id,
        snapshot: jsonSchema,
        snapshot_revision: z.number().int().positive(),
        projected_revision: z.number().int().nonnegative(),
      })
      .strict(),
  })
  .strict();
export const interactionRecordSchema = z
  .object({
    ...base,
    status: z.enum(['pending', 'answered', 'applied', 'cancelled']),
    payload: z
      .object({
        native_path: z.array(id).min(1),
        occurrence: id,
        definition_digest: id,
        request: jsonSchema,
        request_digest: id,
        response_schema: jsonSchema,
        revision: z.number().int().positive(),
        expires_at: z.number().int().positive(),
        response: jsonSchema.nullable(),
        response_digest: id.nullable(),
        responded_by: id.nullable(),
      })
      .strict(),
  })
  .strict();
export const effectRecordSchema = z
  .object({
    ...base,
    status: z.enum(['committed', 'unknown']),
    payload: z
      .object({
        arguments_digest: id,
        result: jsonSchema,
        tool_id: id,
      })
      .strict(),
  })
  .strict();
export const memoryRecordSchema = z
  .object({ ...base, payload: z.object({ value: jsonSchema }).strict() })
  .strict();
export const callRecordSchema = z
  .object({
    ...base,
    status: z.enum(['pending', 'succeeded', 'failed', 'unknown']),
    payload: z
      .object({
        attempt: z.number().int().nonnegative(),
        profile: id,
        input_tokens: z.number().nonnegative(),
        output_tokens: z.number().nonnegative(),
        error_code: z.string().nullable(),
        duration_ms: z.number().nonnegative(),
      })
      .strict(),
  })
  .strict();
export const traceRecordSchema = z
  .object({
    ...base,
    payload: z
      .object({
        name: id,
        parent_id: id.nullable(),
        duration_ms: z.number().nonnegative(),
        attributes: z.record(z.string(), jsonSchema),
      })
      .strict(),
  })
  .strict();
export const artifactRecordSchema = z
  .object({
    ...base,
    payload: z.object({ name: id, media_type: id, content: jsonSchema, digest: id }).strict(),
  })
  .strict();
export const aiRecordSchemas = {
  ai_executions: executionRecordSchema,
  ai_events: eventRecordSchema,
  ai_snapshots: snapshotRecordSchema,
  ai_interactions: interactionRecordSchema,
  ai_effects: effectRecordSchema,
  ai_threads: memoryRecordSchema,
  ai_messages: memoryRecordSchema,
  ai_calls: callRecordSchema,
  ai_traces: traceRecordSchema,
  ai_artifacts: artifactRecordSchema,
};
export type AiTable = keyof typeof aiRecordSchemas;
export type AiRecordMap = { [K in AiTable]: z.infer<(typeof aiRecordSchemas)[K]> };
export const aiTables = Object.keys(aiRecordSchemas) as AiTable[];
export function parseAiRecord<K extends AiTable>(table: K, value: unknown): AiRecordMap[K] {
  return aiRecordSchemas[table].parse(value) as AiRecordMap[K];
}
export function asJson(value: unknown): Json {
  return jsonSchema.parse(value);
}
