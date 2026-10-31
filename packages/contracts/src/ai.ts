import { z } from 'zod';

const json = z.json();
const id = z.string().min(1).max(200);
export const submitAiExecutionRequestSchema = z
  .object({ operation_id: id, model_profile: id.optional(), input: json })
  .strict();
export const respondAiInteractionRequestSchema = z.object({ response: json }).strict();
export const listAiExecutionsQuerySchema = z
  .object({
    cursor: z.string().max(500).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(30),
  })
  .strict();
export const aiExecutionStatusSchema = z.enum([
  'queued',
  'running',
  'waiting_input',
  'succeeded',
  'failed',
  'cancelled',
  'timed_out',
]);
export const aiUsageSchema = z
  .object({
    requests: z.number(),
    tools: z.number(),
    input_tokens: z.number(),
    output_tokens: z.number(),
    unknown_requests: z.number(),
  })
  .strict();
export const aiExecutionResponseSchema = z
  .object({
    id,
    owner_id: id,
    operation_id: id,
    model_profile: id,
    status: aiExecutionStatusSchema,
    revision: z.number().int().positive(),
    attempt: z.number().int().nonnegative(),
    continuation: z.number().int().nonnegative(),
    input: json,
    result: json.nullable(),
    created_at: z.iso.datetime(),
    updated_at: z.iso.datetime(),
    deadline: z.number(),
    last_seq: z.number(),
    message_text: z.string(),
    usage: aiUsageSchema,
    message_blocks: z.array(
      z
        .object({ id: z.string(), message_id: z.string(), text: z.string(), complete: z.boolean() })
        .strict(),
    ),
    error: z
      .object({ code: z.string(), message: z.string(), retryable: z.boolean() })
      .strict()
      .nullable(),
  })
  .strict();
export const aiInteractionResponseSchema = z
  .object({
    id,
    status: z.enum(['pending', 'answered', 'applied', 'cancelled']),
    revision: z.number().int().positive(),
    request: json,
    response_schema: json,
    response: json.nullable(),
    expires_at: z.number(),
  })
  .strict();
export const aiArtifactResponseSchema = z
  .object({ id, name: z.string(), media_type: z.string(), content: json, digest: z.string() })
  .strict();
export const aiCatalogResponseSchema = z
  .object({
    default_profile: z.string(),
    profiles: z.array(
      z
        .object({
          id,
          label: z.string(),
          format: z.enum(['openai', 'anthropic']),
          model: z.string(),
        })
        .strict(),
    ),
    operations: z.array(
      z
        .object({
          id,
          version: z.string(),
          title: z.string(),
          description: z.string(),
          input_schema: json,
          output_schema: json,
          interactions: z.record(z.string(), json),
          digest: z.string(),
        })
        .strict(),
    ),
  })
  .strict();
export const aiExecutionListResponseSchema = z
  .object({ items: z.array(aiExecutionResponseSchema), next_cursor: z.string().nullable() })
  .strict();
export const aiEventTypeSchema = z.enum([
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
]);
const eventError = z
  .object({ code: z.string(), message: z.string(), retryable: z.boolean() })
  .strict();
const eventDataSchemas = {
  'execution.queued': z.union([
    z.object({ operation_id: id }).strict(),
    z.object({ continuation: z.number().int().nonnegative() }).strict(),
  ]),
  'execution.started': z.object({}).strict(),
  'execution.waiting_input': z.object({}).strict(),
  'execution.completed': z.object({ result: json }).strict(),
  'execution.failed': z.object({ error: eventError }).strict(),
  'execution.cancelled': z.object({}).strict(),
  'execution.timed_out': z.object({ error: eventError }).strict(),
  'execution.retry_scheduled': z.object({ reason: z.literal('interrupted') }).strict(),
  'step.started': z.object({ step_id: id }).strict(),
  'step.completed': z.object({ step_id: id, duration_ms: z.number().nonnegative() }).strict(),
  'step.failed': z.object({ step_id: id, code: z.string() }).strict(),
  'message.started': z.object({ message_id: id, block_id: id, format: z.literal('text') }).strict(),
  'message.delta': z
    .object({
      message_id: id,
      block_id: id,
      offset: z.number().int().nonnegative(),
      delta: z.string(),
    })
    .strict(),
  'message.completed': z
    .object({ message_id: id, block_id: id, length: z.number().int().nonnegative() })
    .strict(),
  'tool.started': z.object({ tool_id: id, invocation_id: id }).strict(),
  'tool.completed': z.object({ tool_id: id, invocation_id: id }).strict(),
  'tool.failed': z.object({ tool_id: id, invocation_id: id, code: z.string() }).strict(),
  'interaction.requested': z
    .object({
      interaction_id: id,
      request: json,
      response_schema: json,
      revision: z.number().int().positive(),
    })
    .strict(),
  'interaction.responded': z.object({ interaction_id: id }).strict(),
  'usage.updated': aiUsageSchema,
  'artifact.created': z
    .object({ artifact_id: id, name: z.string(), media_type: z.string() })
    .strict(),
} satisfies Record<z.infer<typeof aiEventTypeSchema>, z.ZodType>;
export const aiEventResponseSchema = z
  .object({
    schema_version: z.literal(1),
    execution_id: id,
    audience: z.literal('operator'),
    seq: z.number().int().positive(),
    type: aiEventTypeSchema,
    attempt: z.number().int().nonnegative(),
    continuation: z.number().int().nonnegative(),
    occurred_at: z.iso.datetime(),
    data: z.record(z.string(), json),
  })
  .strict()
  .superRefine((event, ctx) => {
    const parsed = eventDataSchemas[event.type].safeParse(event.data);
    if (!parsed.success)
      ctx.addIssue({ code: 'custom', path: ['data'], message: '事件负载不符合类型契约' });
  });
export const aiActivityEventTypeSchema = aiEventTypeSchema.exclude([
  'message.delta',
  'message.completed',
  'usage.updated',
  'execution.completed',
]);
export const aiStreamErrorResponseSchema = z
  .object({
    schema_version: z.literal(1),
    code: z.enum(['ACCESS_REVOKED', 'STREAM_UNAVAILABLE']),
  })
  .strict();
export const aiExecutionViewResponseSchema = z
  .object({
    execution: aiExecutionResponseSchema,
    interactions: z.array(aiInteractionResponseSchema),
    artifacts: z.array(aiArtifactResponseSchema),
    activity: z.array(aiEventResponseSchema).max(1000),
    activity_truncated: z.boolean(),
    watermark: z.number().int().nonnegative(),
  })
  .strict()
  .superRefine((view, ctx) => {
    let previous = 0;
    for (const event of view.activity) {
      if (
        event.execution_id !== view.execution.id ||
        event.seq <= previous ||
        event.seq > view.watermark ||
        !aiActivityEventTypeSchema.safeParse(event.type).success
      ) {
        ctx.addIssue({
          code: 'custom',
          path: ['activity'],
          message: '活动记录归属、顺序或水位无效',
        });
        break;
      }
      previous = event.seq;
    }
  });
export type SubmitAiExecutionRequest = z.infer<typeof submitAiExecutionRequestSchema>;
export type AiExecutionResponse = z.infer<typeof aiExecutionResponseSchema>;
export type AiInteractionResponse = z.infer<typeof aiInteractionResponseSchema>;
export type AiExecutionViewResponse = z.infer<typeof aiExecutionViewResponseSchema>;
export type AiExecutionListResponse = z.infer<typeof aiExecutionListResponseSchema>;
export type AiCatalogResponse = z.infer<typeof aiCatalogResponseSchema>;
export type AiEventResponse = z.infer<typeof aiEventResponseSchema>;
