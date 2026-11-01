import { z } from 'zod';

const json = z.json();
const id = z.string().min(1).max(200);
/**
 * 发起 AI 执行：`operation_id` 指向目录中登记的可执行操作，`input` 为任意 JSON，
 * 其结构由该操作的输入 schema 在服务端再校验；`model_profile` 省略时用目录里的默认档。
 */
export const submitAiExecutionRequestSchema = z
  .object({ operation_id: id, model_profile: id.optional(), input: json })
  .strict();
/** 回应交互请求：`response` 为任意 JSON，形状取决于该交互声明的 `response_schema`。 */
export const respondAiInteractionRequestSchema = z.object({ response: json }).strict();
/**
 * 执行列表查询：`limit` 1–100 默认 30，`cursor` ≤500 字符且不透明；
 * `operation_id` 只接受登记过的两个操作，其余筛选按关联资源 id 精确匹配。
 */
export const listAiExecutionsQuerySchema = z
  .object({
    cursor: z.string().max(500).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(30),
    operation_id: z.enum(['resource-audit', 'feedback-triage']).optional(),
    version_id: z.uuid().optional(),
    feedback_id: z.uuid().optional(),
  })
  .strict();
/** 执行状态机：`waiting_input` 表示等待外部回应，`timed_out` 与 `cancelled` 都是终态。 */
export const aiExecutionStatusSchema = z.enum([
  'queued',
  'running',
  'waiting_input',
  'succeeded',
  'failed',
  'cancelled',
  'timed_out',
]);
/**
 * 累计用量：请求数与工具调用数、输入输出 token 数均为累计值。
 * `unknown_requests` 记录上游未回传用量或执行中断后无法核实的请求数，只增不减。
 */
export const aiUsageSchema = z
  .object({
    requests: z.number(),
    tools: z.number(),
    input_tokens: z.number(),
    output_tokens: z.number(),
    unknown_requests: z.number(),
  })
  .strict();
/**
 * 执行详情：`revision` 用于乐观锁，`last_seq` 是已提交的最大事件序号，
 * `deadline` 为毫秒时间戳，超时后执行转入 `timed_out`；`continuation` 表示第几段续跑。
 */
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
/**
 * 交互请求：`response_schema` 描述允许的回答形状，`expires_at`（毫秒时间戳）与执行
 * `deadline` 同源，过期后不再接受回答；`revision` 用于提交回答时的乐观锁。
 */
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
/** 执行产物：`digest` 用于校验 `content` 与登记时一致。 */
export const aiArtifactResponseSchema = z
  .object({ id, name: z.string(), media_type: z.string(), content: json, digest: z.string() })
  .strict();
/**
 * 能力目录：`default_profile` 必须指向 `profiles` 之一；每个操作的 `input_schema`/`output_schema`
 * 与 `digest` 一起构成可执行契约，`interactions` 描述该操作可能发起的交互及其回答 schema。
 */
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
/** 执行列表：`next_cursor` 为 `null` 表示没有后续页。 */
export const aiExecutionListResponseSchema = z
  .object({ items: z.array(aiExecutionResponseSchema), next_cursor: z.string().nullable() })
  .strict();
/** 事件类型全集，`execution.*` 为状态迁移、`step.*`/`tool.*` 为过程记录、`message.*` 为流式文本。 */
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
  'tool.started': z
    .object({ tool_id: id, invocation_id: id, display: z.string().max(200).optional() })
    .strict(),
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
/**
 * 事件记录：`seq` 在同一执行内从 1 严格递增，是断线续传的水位；`data` 的形状由 `type`
 * 决定，解析时按 {@link aiEventTypeSchema} 对应负载再校验一次，不符合即拒绝。
 */
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
/**
 * 活动流事件子集：去掉纯增量与终态重复项，只保留适合列表展示的迁移与工具/交互记录。
 */
export const aiActivityEventTypeSchema = aiEventTypeSchema.exclude([
  'message.delta',
  'message.completed',
  'usage.updated',
  'execution.completed',
]);
/** 流级错误：`ACCESS_REVOKED` 表示权限被收回，`STREAM_UNAVAILABLE` 表示流已不可用，客户端都应停止重连。 */
export const aiStreamErrorResponseSchema = z
  .object({
    schema_version: z.literal(1),
    code: z.enum(['ACCESS_REVOKED', 'STREAM_UNAVAILABLE']),
  })
  .strict();
/**
 * 执行视图：`activity` 最多 1000 条且必须是同一执行、`seq` 严格递增、不超过 `watermark`，
 * 并且只能含活动流允许的事件类型。窗口只保留最近的记录，首条 `seq` 大于 1 时
 * `activity_truncated` 为真，表示更早的事件已被丢弃。
 */
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
/** {@link submitAiExecutionRequestSchema} 的输出侧类型，`input` 已确认是合法 JSON。 */
export type SubmitAiExecutionRequest = z.infer<typeof submitAiExecutionRequestSchema>;
/** {@link aiExecutionResponseSchema} 的输出侧类型。 */
export type AiExecutionResponse = z.infer<typeof aiExecutionResponseSchema>;
/** {@link aiInteractionResponseSchema} 的输出侧类型。 */
export type AiInteractionResponse = z.infer<typeof aiInteractionResponseSchema>;
/** {@link aiExecutionViewResponseSchema} 的输出侧类型。 */
export type AiExecutionViewResponse = z.infer<typeof aiExecutionViewResponseSchema>;
/** {@link aiExecutionListResponseSchema} 的输出侧类型。 */
export type AiExecutionListResponse = z.infer<typeof aiExecutionListResponseSchema>;
/** {@link aiCatalogResponseSchema} 的输出侧类型。 */
export type AiCatalogResponse = z.infer<typeof aiCatalogResponseSchema>;
/** {@link aiEventResponseSchema} 的输出侧类型，用于 SSE 单条事件。 */
export type AiEventResponse = z.infer<typeof aiEventResponseSchema>;
