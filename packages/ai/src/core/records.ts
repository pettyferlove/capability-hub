import { z } from 'zod';

/**
 * 可持久化的 JSON 值域：不含 `undefined`、`Date`、`bigint` 与函数，因此写入前必须完成序列化，
 * 恢复时也不需要再猜测类型。
 */
export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

/** `Json` 的运行时校验器；边界 DTO 一律经它收敛，非 JSON 值直接失败而不是被静默丢弃。 */
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

/**
 * 执行状态机。`waiting_input` 是唯一可恢复的暂停态（等待人工交互，且仍受 `deadline` 约束）；
 * 进入 {@link terminalStatuses} 后不再接受任何写入或回答。
 */
export const executionStatusSchema = z.enum([
  'queued',
  'running',
  'waiting_input',
  'succeeded',
  'failed',
  'cancelled',
  'timed_out',
]);

/** 终态集合；一旦命中，调度、回答与取消都必须改判为冲突而不是覆盖结果。 */
export const terminalStatuses = new Set(['succeeded', 'failed', 'cancelled', 'timed_out']);

/**
 * 执行的可变载荷。`revision` 是乐观锁基准（每次写入递增，调用方带旧值会得到
 * `AI_REVISION_CONFLICT`）；`dispatch_id` 与队列租约一一对应，为 null 表示尚未派发；
 * `deadline` 是绝对毫秒时间戳，写入前后都会比对，跨进程恢复时同样有效；`last_seq` 是事件流水位，
 * 只增不减，读取快照时以此为界；`event_bytes` 累计事件字节（上限见 `max_event_bytes`），
 * `usage` 累计用量且 `unknown_requests` 只增不减（崩溃前预留的请求不能被当成未发生）。
 */
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

/** 执行记录：`status` 与 `payload` 必须一起更新，单独改状态会绕过修订号与租约校验。 */
export const executionRecordSchema = z
  .object({ ...base, status: executionStatusSchema, payload: executionPayloadSchema })
  .strict();

/** 解析后（而非自定义断言）的执行记录；任何写入都会先经 `parseAiRecord` 校验。 */
export type ExecutionRecord = z.infer<typeof executionRecordSchema>;

/**
 * 事件类型全集。命名前缀即事件域的排序语义：`execution.*` 只描述生命周期，`message.delta` 是
 * 高频增量（读取视图默认排除），`tool.*` 与 `step.*` 记录副作用边界，`usage.updated` 携带累计用量
 * 快照。新增类型必须同时进这里，否则事件写入会被 Schema 拒绝。
 */
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

/**
 * 单条事件。`seq` 在同一执行内从 1 单调递增且不能回退，消费端据此判断是否丢帧；
 * `audience` 是可见受众标记，当前运行时统一写 `operator`；`occurred_at` 是产生时间而非落库时间，
 * `schema_version` 固定为 1，形状变更必须升版本而不是就地加字段。
 */
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

/** 事件类型名，取值必须来自 {@link eventTypes}；拼写错误由类型检查拦下，而不是落库后才失败。 */
export type AiEventType = (typeof eventTypes)[number];

/** 解析后的事件记录；`payload.data` 只允许 JSON，正文与凭据不得写进这里。 */
export type AiEvent = z.infer<typeof eventRecordSchema>;

/**
 * 原生工作流快照。必须与 `sdk_version`（当前固定 `1.81.0`）一起保存：SDK 升级后旧快照不能直接
 * 反序列化，只能按版本判断并放弃恢复。`snapshot_revision` 是快照自身的版本，`projected_revision`
 * 记录已投影到的业务修订号，用于避免重复投影。
 */
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

/**
 * 一次人工交互。`pending → answered → applied` 是唯一合法推进顺序，`cancelled` 只能从事前两种进入。
 * `native_path` 是原生工作流里的暂停位置（配合 `occurrence` 区分同位置多次暂停），`request_digest`
 * 用于恢复时核对暂停参数没变；`response_digest` 必须与 `response` 一致，否则视为回执不完整；
 * `expires_at` 与执行 `deadline` 同源，过期后不再接受回答。
 */
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

/**
 * 副作用回执。以 `(execution, key)` 为幂等键、`arguments_digest` 校验参数未变：命中已提交的回执
 * 直接复用结果，参数不同或状态为 `unknown` 一律视为恢复不确定。`unknown` 表示崩溃前副作用已发起
 * 但结果未落定，重放可能重复生效，必须人工处置而不是自动重试。
 */
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

/**
 * 会话记忆（`ai_threads`/`ai_messages` 共用）。内容整体放在 `payload.value` 里由 SDK 决定形状，
 * 作用域限定在单次执行：读取时按 `execution_id` + `owner_id` 校验，跨执行访问会被拒绝。
 */
export const memoryRecordSchema = z
  .object({ ...base, payload: z.object({ value: jsonSchema }).strict() })
  .strict();

const elapsedMs = z.number().int().nonnegative();
const callDiagnosticsSchema = z.strictObject({
  agent_id: id,
  step: z.strictObject({ id, start_seq: z.number().int().positive() }).optional(),
  model: id,
  format: z.enum(['openai', 'anthropic']),
  request_timeout_ms: z.number().int().positive(),
  max_output_tokens: z.number().int().positive(),
  transport: z
    .strictObject({
      http_status: z.number().int().min(100).max(599).optional(),
      headers_ms: elapsedMs.optional(),
      first_output_ms: elapsedMs.optional(),
      last_output_ms: elapsedMs.optional(),
      received_bytes: z.number().int().nonnegative(),
      text_chars: z.number().int().nonnegative(),
      finish_reason: z
        .enum(['stop', 'length', 'tool_call', 'content_filter', 'context_limit', 'other'])
        .optional(),
      terminal_received: z.boolean(),
      request_timed_out: z.boolean(),
      input_tokens_reported: z.boolean(),
      output_tokens_reported: z.boolean(),
    })
    .optional(),
});

/** 请求发起时固定配置与步骤，传输观测仅在本次请求实际结算时写入。 */
export type ModelCallDiagnostics = z.infer<typeof callDiagnosticsSchema>;

/**
 * 单次 provider 请求的用量与结果。`pending` 表示已预留但未结算；进程崩溃后启动阶段会把残留的
 * `pending` 一律改判为 `unknown` 并计入 `unknown_requests`——网络请求可能已经发生，不能假定未计费。
 */
export const callRecordSchema = z
  .object({
    ...base,
    status: z.enum(['pending', 'succeeded', 'failed', 'unknown']),
    payload: z
      .object({
        attempt: z.number().int().nonnegative(),
        profile: id,
        diagnostics: callDiagnosticsSchema,
        input_tokens: z.number().nonnegative(),
        output_tokens: z.number().nonnegative(),
        error_code: z.string().nullable(),
        duration_ms: z.number().nonnegative(),
      })
      .strict(),
  })
  .strict();

/** 执行内的时间片段，`parent_id` 为 null 表示根节点；`attributes` 只放 JSON，不得写入正文或凭据。 */
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

/** 执行产出的成果；单个成果上限 1 MB（超出即 `AI_BUDGET_EXCEEDED`），`digest` 用于校验内容未被替换。 */
export const artifactRecordSchema = z
  .object({
    ...base,
    payload: z.object({ name: id, media_type: id, content: jsonSchema, digest: id }).strict(),
  })
  .strict();

/** 表名到 Schema 的映射，是 `AiTable`/`AiRecordMap` 的唯一事实来源；新增表必须加在这里。 */
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

/** AI 侧可访问的表名，与物理表名一致，不做映射。 */
export type AiTable = keyof typeof aiRecordSchemas;

/** 表名 → 记录类型的映射，供 `AiQueries` 的泛型约束使用。 */
export type AiRecordMap = { [K in AiTable]: z.infer<(typeof aiRecordSchemas)[K]> };

/** 表名清单，顺序与映射声明顺序一致；用于遍历建表或清理，不保证稳定不变。 */
export const aiTables = Object.keys(aiRecordSchemas) as AiTable[];

/**
 * 按表解析并校验记录。用于读路径与写入前收敛：未知表、缺失字段或多余字段都会抛出 ZodError，
 * 因此不接受未经校验的外部数据直接落库。
 */
export function parseAiRecord<K extends AiTable>(table: K, value: unknown): AiRecordMap[K] {
  return aiRecordSchemas[table].parse(value) as AiRecordMap[K];
}

/** 断言值为纯 JSON；`undefined`、`Date`、`bigint` 等会抛错而不是被静默转换。 */
export function asJson(value: unknown): Json {
  return jsonSchema.parse(value);
}
