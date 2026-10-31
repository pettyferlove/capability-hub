import type { AiRecordMap, AiTable } from '@capability-hub/ai/records';
import { sql } from 'drizzle-orm';
import {
  sqliteTable,
  text,
  integer,
  check,
  index,
  uniqueIndex,
  foreignKey,
  type SQLiteTableExtraConfigValue,
} from 'drizzle-orm/sqlite-core';

function defineAiTable(name: AiTable) {
  return sqliteTable(
    name,
    {
      id: text('id').primaryKey().notNull(),
      data: text('data', { mode: 'json' }).$type<AiRecordMap[AiTable]>().notNull(),
      owner_id: text('owner_id')
        .generatedAlwaysAs(sql`json_extract(data, '$.owner_id')`, { mode: 'stored' })
        .notNull(),
      execution_id: text('execution_id')
        .generatedAlwaysAs(sql`json_extract(data, '$.execution_id')`, { mode: 'stored' })
        .notNull(),
      lookup_key: text('lookup_key')
        .generatedAlwaysAs(sql`json_extract(data, '$.lookup_key')`, { mode: 'stored' })
        .notNull(),
      status: text('status')
        .generatedAlwaysAs(sql`json_extract(data, '$.status')`, { mode: 'stored' })
        .notNull(),
      created_at: text('created_at')
        .generatedAlwaysAs(sql`json_extract(data, '$.created_at')`, { mode: 'stored' })
        .notNull(),
      updated_at: text('updated_at')
        .generatedAlwaysAs(sql`json_extract(data, '$.updated_at')`, { mode: 'stored' })
        .notNull(),
      position: integer('position')
        .generatedAlwaysAs(sql`json_extract(data, '$.position')`, { mode: 'stored' })
        .notNull(),
    },
    (t): SQLiteTableExtraConfigValue[] => [
      check(
        name + '_data_check',
        sql`(json_valid(data) AND json_type(data) = 'object' AND json_extract(data, '$.id') = id) IS 1`,
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
