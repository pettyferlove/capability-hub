import { z } from 'zod';
import {
  aiArtifactResponseSchema,
  aiEventResponseSchema,
  aiExecutionPageQuerySchema,
  aiExecutionResponseSchema,
  aiInteractionResponseSchema,
  aiModelOptionsResponseSchema,
} from '../../ai.js';

const root = '/api/admin/operations/agents';
const executions = root + '/executions';

/** 运营检查接口独立于业务执行接口，下载与页面读取使用同一任务地址。 */
export const operationsAgentApi = {
  root,
  catalog: root + '/catalog',
  executions,
  diagnostics: (id: string) => executions + '/' + encodeURIComponent(id) + '/diagnostics',
  exchange: (id: string, callId: string) =>
    executions +
    '/' +
    encodeURIComponent(id) +
    '/calls/' +
    encodeURIComponent(callId) +
    '/exchange',
};

const id = aiExecutionResponseSchema.shape.id;
const json = z.json();
const modelOption = aiModelOptionsResponseSchema.shape.profiles.element;

/** 默认列出可手动提交的操作；注册目录还包括可检查的自动操作。 */
export const agentCatalogQuerySchema = z.strictObject({ view: z.literal('registered').optional() });

/** 运营列表只筛选可读执行；业务资源 ID 仅用于业务列表。 */
export const agentExecutionLedgerQuerySchema = aiExecutionPageQuerySchema.extend({
  operation_id: id.optional(),
  q: z.string().trim().max(200).optional(),
  view: z.literal('summary').optional(),
});

/**
 * 能力目录：`default_profile` 必须指向 `profiles` 之一；每个操作的 `input_schema`/`output_schema`
 * 与 `digest` 一起构成可执行契约，`interactions` 描述该操作可能发起的交互及其回答 schema。
 */
export const aiCatalogResponseSchema = aiModelOptionsResponseSchema.extend({
  profiles: z.array(
    modelOption.extend({ format: z.enum(['openai', 'anthropic']), model: z.string() }),
  ),
  operations: z.array(
    z
      .object({
        id,
        execution_mode: z.literal('inline').optional(),
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
});

/** {@link aiCatalogResponseSchema} 的输出侧类型。 */
export type AiCatalogResponse = z.infer<typeof aiCatalogResponseSchema>;

/** 概要检索仅返回列表所需字段，完整消息和成果由单次执行接口提供。 */
export const aiExecutionLedgerResponseSchema = z
  .object({
    items: z.array(
      aiExecutionResponseSchema
        .pick({
          id: true,
          owner_id: true,
          operation_id: true,
          status: true,
          created_at: true,
        })
        .extend({
          owner_display_name: z.string(),
          title: z.string(),
          error_code: z.string().nullable(),
        }),
    ),
    next_cursor: z.string().nullable(),
  })
  .strict();

const elapsedMs = z.number().int().nonnegative();
const upstreamIdentifier = z.string().regex(/^[A-Za-z0-9._:-]{1,128}$/u);
const callDiagnosticsSchema = z.strictObject({
  agent_id: id,
  step: z.strictObject({ id, start_seq: z.number().int().positive() }).optional(),
  model: id,
  format: z.enum(['openai', 'anthropic']),
  request_timeout_ms: z.number().int().positive(),
  max_output_tokens: z.number().int().positive(),
  reasoning_effort: z.enum(['none', 'low', 'medium', 'high', 'xhigh', 'max']).optional(),
  transport: z
    .strictObject({
      http_status: z.number().int().min(100).max(599).optional(),
      upstream_error_code: upstreamIdentifier.optional(),
      upstream_request_id: upstreamIdentifier.optional(),
      headers_ms: elapsedMs.optional(),
      first_output_ms: elapsedMs.optional(),
      last_output_ms: elapsedMs.optional(),
      request_bytes: z.number().int().nonnegative().optional(),
      received_bytes: z.number().int().nonnegative(),
      text_chars: z.number().int().nonnegative(),
      reasoning_tokens: z.number().int().nonnegative().optional(),
      network_error: upstreamIdentifier.optional(),
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

/** 输出被拒的固定分类，与运行时调用记录一致。 */
export const aiOutputRejectionReasons = [
  'empty_output',
  'invalid_json',
  'schema_mismatch',
  'output_limit',
  'content_filter',
  'response_too_large',
  'host_rejected',
] as const;

/** 调用失败原因：传输层原因由传输诊断推导，输出层原因取自输出结论。 */
export const aiCallFailureReasons = [
  'cancelled',
  'execution_timeout',
  'request_timeout',
  'network',
  'http_error',
  'rate_limited',
  'stream_incomplete',
  ...aiOutputRejectionReasons,
] as const;

/** {@link aiCallFailureReasons} 的取值。 */
export type AiCallFailureReason = (typeof aiCallFailureReasons)[number];

const outputCheckSchema = z.strictObject({
  status: z.enum(['accepted', 'rejected']),
  reason: z.enum(aiOutputRejectionReasons).optional(),
  rule: z.string().optional(),
  message: z.string().optional(),
  issues: z
    .array(
      z.strictObject({
        path: z.string(),
        code: z.string(),
        expected: z.string().optional(),
        limit: z.number().optional(),
        actual: z.number().optional(),
        options: z.array(z.string()).optional(),
      }),
    )
    .optional(),
  json_offset: z.number().int().nonnegative().optional(),
  facts: z.record(z.string(), z.union([z.number(), z.boolean()])).optional(),
});

/** 一次模型请求的往返原文；`response` 为 null 表示请求发出后没有收到响应。 */
export const aiModelExchangeResponseSchema = z.strictObject({
  call_id: id,
  captured_at: z.iso.datetime(),
  resource_refs: z.array(z.string()),
  request: z.strictObject({
    bytes: z.number().int().nonnegative(),
    body: json.optional(),
    text: z.string().optional(),
    truncated: z.boolean(),
  }),
  response: z
    .strictObject({
      response_id: z.string().optional(),
      text: z.string(),
      reasoning: z.string(),
      tool_calls: z.array(
        z.strictObject({ id: z.string().optional(), name: z.string(), arguments: z.string() }),
      ),
      finish_reason: z.string().optional(),
      usage: json.optional(),
      error_body: z.string().optional(),
      raw: z.string().optional(),
      truncated: z.boolean(),
    })
    .nullable(),
});

/** {@link aiModelExchangeResponseSchema} 的输出侧类型。 */
export type AiModelExchangeResponse = z.infer<typeof aiModelExchangeResponseSchema>;

const diagnosticsV2 = z
  .object({
    schema_version: z.literal(2),
    captured_at: z.iso.datetime(),
    watermark: z.number().int().nonnegative(),
    event_gaps: z.array(
      z
        .object({ from_seq: z.number().int().positive(), through_seq: z.number().int().positive() })
        .strict(),
    ),
    execution: aiExecutionResponseSchema.extend({
      error: aiExecutionResponseSchema.shape.error
        .unwrap()
        .extend({ call_id: id.optional() })
        .nullable(),
    }),
    owner_display_name: z.string(),
    workflow: z
      .object({
        workflow_id: id,
        run_id: id,
        definition_version: id,
        definition_digest: id,
        model_digest: id,
      })
      .strict(),
    events: z.array(aiEventResponseSchema),
    model_calls: z.array(
      z
        .object({
          id,
          started_at: z.iso.datetime(),
          updated_at: z.iso.datetime(),
          status: z.enum(['pending', 'succeeded', 'failed', 'unknown']),
          attempt: z.number().int().nonnegative(),
          profile: id,
          diagnostics: callDiagnosticsSchema,
          input_tokens: z.number().nonnegative(),
          output_tokens: z.number().nonnegative(),
          duration_ms: z.number().nonnegative(),
          error_code: z.string().nullable(),
          output_check: outputCheckSchema.optional(),
          failure_reason: z.enum(aiCallFailureReasons).optional(),
          exchange: z.enum(['available', 'withheld', 'none']),
        })
        .strict(),
    ),
    traces: z.array(
      z
        .object({
          id,
          name: id,
          parent_id: id.nullable(),
          started_at: z.iso.datetime(),
          duration_ms: z.number().nonnegative(),
        })
        .strict(),
    ),
    interactions: z.array(
      aiInteractionResponseSchema.extend({
        step_path: z.array(id),
        responded_by: id.nullable(),
        updated_at: z.iso.datetime(),
      }),
    ),
    effects: z.array(
      z
        .object({
          id,
          tool_id: id,
          status: z.enum(['committed', 'unknown']),
          arguments_digest: id,
          created_at: z.iso.datetime(),
        })
        .strict(),
    ),
    artifacts: z.array(aiArtifactResponseSchema),
    resources: z.array(z.object({ reference: z.string(), digest: z.string().nullable() }).strict()),
    exchanges: z.array(aiModelExchangeResponseSchema).optional(),
  })
  .strict();

/** v1 导出没有原文可用性；只有读取旧格式时才把缺失的标记解释为未留存。 */
export const aiExecutionDiagnosticsResponseSchema = z.discriminatedUnion('schema_version', [
  diagnosticsV2,
  diagnosticsV2.extend({
    schema_version: z.literal(1),
    model_calls: z.array(
      diagnosticsV2.shape.model_calls.element.extend({
        exchange: diagnosticsV2.shape.model_calls.element.shape.exchange.default('none'),
      }),
    ),
  }),
]);

/** 机器可读的诊断格式与交接 Markdown 共用同一份执行快照。 */
export type AiExecutionDiagnosticsResponse = z.infer<typeof aiExecutionDiagnosticsResponseSchema>;

/** 在线复制使用独立采集的文本及水位。 */
export const aiDiagnosticHandoffResponseSchema = z
  .object({ markdown: z.string(), watermark: z.number().int().nonnegative() })
  .strict();
