import type { AiQueries, AiRecordQuery } from '@capability-hub/ai/ports';
import { parseAiRecord, type AiTable, type AiRecordMap } from '@capability-hub/ai/records';
import { and, or, eq, gt, lt, asc, desc, inArray, sql } from 'drizzle-orm';
import { aiSchema } from './ai-schema.js';
import type { SqliteRemoteDatabase } from 'drizzle-orm/sqlite-proxy';
import type { sqliteSchema } from './record-schema.js';

type Session = Pick<
  SqliteRemoteDatabase<typeof sqliteSchema>,
  'select' | 'insert' | 'update' | 'delete'
>;

/**
 * SQLite（drizzle proxy 远程驱动）上的 AI 表查询：与 PostgreSQL 版语义一致，差异在
 * `event_types` 过滤改用 `json_extract`，且事务由调用方的会话串行执行器保证不并发。
 * `limit` 上限 1000；`put` 要求行已存在，缺行直接抛错。
 */
export class SqliteAiQueries implements AiQueries {
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
      conditions.push(inArray(sql`json_extract(${t.data}, '$.payload.type')`, query.event_types));
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
