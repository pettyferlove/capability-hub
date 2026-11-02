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
};

const id = aiExecutionResponseSchema.shape.id;
const json = z.json();
const modelOption = aiModelOptionsResponseSchema.shape.profiles.element;

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

/** 单次执行的诊断快照。事件按 seq 排列，缺失区间以闭区间表示。 */
export const aiExecutionDiagnosticsResponseSchema = z
  .object({
    schema_version: z.literal(1),
    captured_at: z.iso.datetime(),
    watermark: z.number().int().nonnegative(),
    event_gaps: z.array(
      z
        .object({ from_seq: z.number().int().positive(), through_seq: z.number().int().positive() })
        .strict(),
    ),
    execution: aiExecutionResponseSchema,
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
          input_tokens: z.number().nonnegative(),
          output_tokens: z.number().nonnegative(),
          duration_ms: z.number().nonnegative(),
          error_code: z.string().nullable(),
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
  })
  .strict();

/** 机器可读的诊断格式与交接 Markdown 共用同一份执行快照。 */
export type AiExecutionDiagnosticsResponse = z.infer<typeof aiExecutionDiagnosticsResponseSchema>;

/** 在线复制使用独立采集的文本及水位。 */
export const aiDiagnosticHandoffResponseSchema = z
  .object({ markdown: z.string(), watermark: z.number().int().nonnegative() })
  .strict();
