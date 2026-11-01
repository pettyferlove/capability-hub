import { parseRecord, type RecordMap, type TableName } from '@capability-hub/domain/models';
import { eq, sql } from 'drizzle-orm';
import type { RecordQueries } from '../record-driver.js';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { pgRevision, type pgSchema, pgTableFor } from './record-schema.js';

/** 查询对象所需的 drizzle 会话子集：既接受连接池上的 db，也接受事务内的 tx。 */
export type PostgresSession = Pick<
  NodePgDatabase<typeof pgSchema>,
  'select' | 'insert' | 'update' | 'delete' | 'execute'
>;

/**
 * `RecordQueries` 的 PostgreSQL 实现：读写只经过 `id`/`data`，约束与生成列全部交给 Schema。
 *
 * 每条记录在写入与读出时都会 `parseRecord` 校验并做 Zod 解析，损坏或旧版本的 JSON 会在边界处暴露。
 * `where` 用 `data ->> key` 过滤 jsonb 字段，不走生成列索引，只适合小结果集；`put` 依 `returning`
 * 行数判断目标存在性，缺失时抛 `Error` 而非静默成功。事务与连接由驱动提供，本类不自行取得连接。
 */
export class PgQueries implements RecordQueries {
  constructor(private readonly db: PostgresSession) {}
  async get<K extends TableName>(table: K, id: string | null | undefined) {
    const relation = pgTableFor(table);
    const rows = await this.db
      .select({ data: relation.data })
      .from(relation)
      .where(eq(relation.id, id ?? ''))
      .limit(1);
    return rows[0] ? parseRecord(table, rows[0].data) : undefined;
  }
  async all<K extends TableName>(table: K): Promise<RecordMap[K][]> {
    const relation = pgTableFor(table);
    const rows = await this.db.select({ data: relation.data }).from(relation).orderBy(relation.id);
    return rows.map((row) => parseRecord(table, row.data));
  }
  async where<K extends TableName>(
    table: K,
    key: keyof RecordMap[K] & string,
    value: string,
  ): Promise<RecordMap[K][]> {
    const relation = pgTableFor(table);
    const rows = await this.db
      .select({ data: relation.data })
      .from(relation)
      .where(sql`${relation.data} ->> ${key} = ${value}`)
      .orderBy(relation.id);
    return rows.map((row) => parseRecord(table, row.data));
  }
  async insert<K extends TableName>(table: K, record: RecordMap[K]): Promise<RecordMap[K]> {
    const value = parseRecord(table, record);
    await this.db.insert(pgTableFor(table)).values({ id: value.id, data: value });
    return value;
  }
  async put<K extends TableName>(table: K, record: RecordMap[K]): Promise<RecordMap[K]> {
    const value = parseRecord(table, record);
    const relation = pgTableFor(table);
    const rows = await this.db
      .update(relation)
      .set({ data: value })
      .where(eq(relation.id, value.id))
      .returning({ id: relation.id });
    if (rows.length !== 1) throw new Error('Missing row');
    return value;
  }
  async remove(table: TableName, id: string): Promise<void> {
    const relation = pgTableFor(table);
    await this.db.delete(relation).where(eq(relation.id, id));
  }
  async revision(): Promise<string> {
    const [row] = await this.db
      .select({ revision: pgRevision.revision })
      .from(pgRevision)
      .where(eq(pgRevision.id, 1));
    return String(row.revision);
  }
  async health(): Promise<void> {
    await this.db.execute(sql`select 1`);
  }
  async sizeBytes(): Promise<number> {
    const result = await this.db.execute<{ bytes: string }>(
      sql`select pg_database_size(current_database()) as bytes`,
    );
    return Number(result.rows[0].bytes);
  }
}
