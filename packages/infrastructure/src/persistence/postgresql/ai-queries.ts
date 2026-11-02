import type { AiQueries, AiRecordQuery } from '@capability-hub/ai/ports';
import {
  callRecordSchema,
  executionStatusSchema,
  parseAiRecord,
  type AiTable,
  type AiRecordMap,
} from '@capability-hub/ai/records';
import { and, or, eq, gt, lt, asc, desc, count, inArray, sql } from 'drizzle-orm';
import { aiSchema } from './ai-schema.js';
import { users } from './schema.js';
import type { PostgresSession as Session } from './record-queries.js';

/**
 * PostgreSQL 上的 AI 表查询：记录体整块存进 `data` jsonb，`event_types` 过滤走 jsonb 路径取值。
 * 分页游标是 `(position, id)` 复合比较，`limit` 上限 1000；`put` 要求行已存在，缺行直接抛错
 * 而不是静默插入。事务与 `BEGIN IMMEDIATE` 等并发语义由传入的会话负责。
 */
export class PgAiQueries implements AiQueries {
  constructor(private readonly db: Session) {}
  private table(name: AiTable) {
    return aiSchema[name];
  }
  async get<K extends AiTable>(table: K, id: string): Promise<AiRecordMap[K] | undefined> {
    const t = this.table(table);
    const [row] = await this.db.select({ data: t.data }).from(t).where(eq(t.id, id)).limit(1);
    return row ? parseAiRecord(table, row.data) : undefined;
  }
  async list<K extends AiTable>(table: K, query: AiRecordQuery): Promise<AiRecordMap[K][]> {
    if (!Number.isSafeInteger(query.limit) || query.limit < 1 || query.limit > 1000)
      throw new Error('AI query limit is invalid');
    const t = this.table(table);
    const conditions = [];
    if (query.event_types) {
      if (table !== 'ai_events') throw new Error('Event types only apply to AI events');
      conditions.push(inArray(sql`${t.data}->'payload'->>'type'`, query.event_types));
    }
    for (const key of ['owner_id', 'execution_id', 'lookup_key', 'status'] as const)
      if (query[key] !== undefined) conditions.push(eq(t[key], query[key]));
    if (query.before_position !== undefined) conditions.push(lt(t.position, query.before_position));
    if (query.after) {
      const compare = query.descending ? lt : gt;
      conditions.push(
        or(
          compare(t.position, query.after.position),
          and(eq(t.position, query.after.position), compare(t.id, query.after.id)),
        ),
      );
    }
    const order = query.descending ? desc : asc;
    const rows = await this.db
      .select({ data: t.data })
      .from(t)
      .where(and(...conditions))
      .orderBy(order(t.position), order(t.id))
      .limit(query.limit);
    return rows.map((row) => parseAiRecord(table, row.data));
  }
  async summarizeExecutions() {
    const t = aiSchema.ai_executions;
    const operation = sql<string>`${t.data}->'payload'->>'operation_id'`;
    return await this.db
      .select({
        operation_id: operation,
        status: sql`${t.status}`.mapWith((value: unknown) => executionStatusSchema.parse(value)),
        count: count(),
        last_activity_at: sql<string>`max(${t.updated_at})`,
      })
      .from(t)
      .groupBy(operation, t.status);
  }
  async summarizeExecutionDays(from: string, through: string) {
    const t = aiSchema.ai_executions;
    const operation = sql<string>`${t.data}->'payload'->>'operation_id'`;
    const error = sql<string | null>`case when ${t.status} in ('failed', 'timed_out')
      then ${t.data}->'payload'->'error'->>'code' end`;
    return await this.db
      .select({
        day_index:
          sql<number>`floor(extract(epoch from (${t.created_at}::timestamptz - ${from}::timestamptz)) / 86400)::int`.as(
            'day_index',
          ),
        operation_id: operation,
        status: sql`${t.status}`.mapWith((value: unknown) => executionStatusSchema.parse(value)),
        error_code: error,
        count: count(),
      })
      .from(t)
      .where(
        sql`${t.created_at}::timestamptz between ${from}::timestamptz and ${through}::timestamptz`,
      )
      .groupBy(sql`day_index`, operation, t.status, error);
  }
  async summarizeTokenUsage(from: string | null, through: string, granularity: 'day' | 'month') {
    const calls = aiSchema.ai_calls;
    const executions = aiSchema.ai_executions;
    const operation = sql<string>`${executions.data}->'payload'->>'operation_id'`;
    const profile = sql<string>`${calls.data}->'payload'->>'profile'`;
    const format = granularity === 'month' ? 'YYYY-MM' : 'YYYY-MM-DD';
    return await this.db
      .select({
        bucket:
          sql<string>`to_char((${calls.created_at}::timestamptz at time zone 'UTC') + interval '8 hours', ${format})`.as(
            'bucket',
          ),
        operation_id: operation,
        profile,
        owner_id: calls.owner_id,
        owner_label: sql<string | null>`max(${users.data}->>'display_name')`,
        status: sql`${calls.status}`.mapWith((value: unknown) =>
          callRecordSchema.shape.status.parse(value),
        ),
        requests: count(),
        input_tokens: sql`sum((${calls.data}->'payload'->>'input_tokens')::numeric)`.mapWith(
          Number,
        ),
        output_tokens: sql`sum((${calls.data}->'payload'->>'output_tokens')::numeric)`.mapWith(
          Number,
        ),
      })
      .from(calls)
      .innerJoin(executions, eq(executions.id, calls.execution_id))
      .leftJoin(users, eq(users.id, calls.owner_id))
      .where(
        and(
          sql`${calls.created_at}::timestamptz <= ${through}::timestamptz`,
          from ? sql`${calls.created_at}::timestamptz >= ${from}::timestamptz` : undefined,
        ),
      )
      .groupBy(sql`bucket`, operation, profile, calls.owner_id, calls.status);
  }
  async insert<K extends AiTable>(table: K, record: AiRecordMap[K]): Promise<AiRecordMap[K]> {
    const value = parseAiRecord(table, record);
    await this.db.insert(this.table(table)).values({ id: value.id, data: value });
    return value;
  }
  async put<K extends AiTable>(table: K, record: AiRecordMap[K]): Promise<AiRecordMap[K]> {
    const value = parseAiRecord(table, record);
    const t = this.table(table);
    const rows = await this.db
      .update(t)
      .set({ data: value })
      .where(eq(t.id, value.id))
      .returning({ id: t.id });
    if (rows.length !== 1) throw new Error('Missing AI row');
    return value;
  }
  async remove(table: AiTable, id: string): Promise<void> {
    const t = this.table(table);
    await this.db.delete(t).where(eq(t.id, id));
  }
}
