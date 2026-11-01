import type { AiRecordMap, AiTable } from '@capability-hub/ai/records';
import { sql } from 'drizzle-orm';
import {
  pgTable,
  text,
  bigint,
  jsonb,
  check,
  index,
  uniqueIndex,
  foreignKey,
  type PgTableExtraConfigValue,
} from 'drizzle-orm/pg-core';

function defineAiTable(name: AiTable) {
  return pgTable(
    name,
    {
      id: text('id').primaryKey().notNull(),
      data: jsonb('data').$type<AiRecordMap[AiTable]>().notNull(),
      owner_id: text('owner_id')
        .generatedAlwaysAs(sql`(data ->> 'owner_id')`)
        .notNull(),
      execution_id: text('execution_id')
        .generatedAlwaysAs(sql`(data ->> 'execution_id')`)
        .notNull(),
      lookup_key: text('lookup_key')
        .generatedAlwaysAs(sql`(data ->> 'lookup_key')`)
        .notNull(),
      status: text('status')
        .generatedAlwaysAs(sql`(data ->> 'status')`)
        .notNull(),
      created_at: text('created_at')
        .generatedAlwaysAs(sql`(data ->> 'created_at')`)
        .notNull(),
      updated_at: text('updated_at')
        .generatedAlwaysAs(sql`(data ->> 'updated_at')`)
        .notNull(),
      position: bigint('position', { mode: 'number' })
        .generatedAlwaysAs(sql`((data ->> 'position')::bigint)`)
        .notNull(),
    },
    (t): PgTableExtraConfigValue[] => [
      check(
        name + '_data_check',
        sql`(jsonb_typeof(data) = 'object' AND data ->> 'id' = id) IS TRUE`,
      ),
      index(name + '_execution_position_idx').on(t.execution_id, t.position, t.id),
      index(name + '_owner_position_idx').on(t.owner_id, t.position, t.id),
      index(name + '_lookup_position_idx').on(t.lookup_key, t.position, t.id),
      index(name + '_status_position_idx').on(t.status, t.position, t.id),
      ...(name === 'ai_events'
        ? [uniqueIndex('ai_events_stream_seq_uq').on(t.lookup_key, t.position)]
        : []),
      ...(['ai_snapshots', 'ai_interactions', 'ai_effects'].includes(name)
        ? [uniqueIndex(name + '_lookup_uq').on(t.lookup_key)]
        : []),
      ...(name === 'ai_interactions'
        ? [
            uniqueIndex('ai_interactions_pending_uq')
              .on(t.execution_id)
              .where(sql`${t.status} = 'pending'`),
          ]
        : []),
      ...(name === 'ai_executions'
        ? []
        : [foreignKey({ columns: [t.execution_id], foreignColumns: [ai_executions.id] })]),
    ],
  );
}
/**
 * AI 记录表族的 PostgreSQL 定义：整条记录存在 `data` jsonb 里，另用 `GENERATED ALWAYS AS`
 * 把 `owner_id`/`execution_id`/`lookup_key`/`status`/`created_at`/`updated_at`/`position`
 * 抽成真实列（`position` 为 bigint，驱动侧映射回 number），索引、外键与唯一约束因此由数据库强制，
 * 写入方只需提交一个 JSON。`*_data_check` 要求 `jsonb_typeof(data) = 'object'` 且 `data ->> 'id'`
 * 等于主键，防止索引列与 JSON 内容分叉。除本表外的 `ai_*` 表都以 `execution_id` 外键指向本表。
 */
export const ai_executions = defineAiTable('ai_executions');
/** 流式事件：`(lookup_key, position)` 唯一，同一流内序号不可重复。 */
export const ai_events = defineAiTable('ai_events');
/** 快照：`lookup_key` 唯一，同一键只能有一份，重复提交必须走更新而不是新增。 */
export const ai_snapshots = defineAiTable('ai_snapshots');
/** 人工交互：`lookup_key` 唯一，且部分唯一索引保证同一执行同时最多一条 `pending` 交互。 */
export const ai_interactions = defineAiTable('ai_interactions');
/** 外部副作用：`lookup_key` 唯一，据此让同一效果的重放不会写第二行。 */
export const ai_effects = defineAiTable('ai_effects');
/** 会话容器；与 `ai_messages` 一起承载模型侧的记忆存储，按 `(execution_id, position)` 顺序读取。 */
export const ai_threads = defineAiTable('ai_threads');
/** 会话消息，行内 `lookup_key` 指向所属会话。 */
export const ai_messages = defineAiTable('ai_messages');
/** 单次模型调用记录（耗时、token 用量、错误码），按 `(execution_id, position)` 回放。 */
export const ai_calls = defineAiTable('ai_calls');
/** 追踪片段，`payload.parent_id` 表达调用树；只有位置索引，不做唯一约束。 */
export const ai_traces = defineAiTable('ai_traces');
/** 产出物（名称、媒体类型、内容、摘要）；同样只有位置索引，允许多次产出。 */
export const ai_artifacts = defineAiTable('ai_artifacts');
/** 按表名索引的全量集合，迁移与查询都从这里取表对象。 */
export const aiSchema: Record<AiTable, ReturnType<typeof defineAiTable>> = {
  ai_executions,
  ai_events,
  ai_snapshots,
  ai_interactions,
  ai_effects,
  ai_threads,
  ai_messages,
  ai_calls,
  ai_traces,
  ai_artifacts,
};
