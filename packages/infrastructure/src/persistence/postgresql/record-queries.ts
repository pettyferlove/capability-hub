import { parseRecord, type RecordMap, type TableName } from '@capability-hub/domain/models';
import { eq, sql } from 'drizzle-orm';
import type { RecordQueries } from '../record-driver.js';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { pgRevision, type pgSchema, pgTableFor } from './record-schema.js';

export type PostgresSession = Pick<
  NodePgDatabase<typeof pgSchema>,
  'select' | 'insert' | 'update' | 'delete' | 'execute'
>;
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
}
