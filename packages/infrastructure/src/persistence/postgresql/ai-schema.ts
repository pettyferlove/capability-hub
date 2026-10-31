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
export const ai_executions = defineAiTable('ai_executions');
export const ai_events = defineAiTable('ai_events');
export const ai_snapshots = defineAiTable('ai_snapshots');
export const ai_interactions = defineAiTable('ai_interactions');
export const ai_effects = defineAiTable('ai_effects');
export const ai_threads = defineAiTable('ai_threads');
export const ai_messages = defineAiTable('ai_messages');
export const ai_calls = defineAiTable('ai_calls');
export const ai_traces = defineAiTable('ai_traces');
export const ai_artifacts = defineAiTable('ai_artifacts');
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
