import type { RecordMap, TableName } from '@capability-hub/domain/models';
import type { PgColumn, PgTableWithColumns } from 'drizzle-orm/pg-core';
import * as schema from './schema.js';

// 通用记录查询只暴露可写的 id/data；表、生成列和约束始终取自完整 Schema。
type ColumnConfig<C> = C extends PgColumn<infer Config> ? Config : never;
type RecordTable = PgTableWithColumns<{
  name: TableName;
  schema: undefined;
  dialect: 'pg';
  columns: {
    id: PgColumn<
      Omit<ColumnConfig<typeof schema.users.id>, 'tableName'> & { tableName: TableName }
    >;
    data: PgColumn<
      Omit<ColumnConfig<typeof schema.users.data>, 'tableName' | 'data'> & {
        tableName: TableName;
        data: RecordMap[TableName];
      }
    >;
  };
}>;
export const pgRevision = schema.hub_revision;
export const pgSchema = schema;

export function pgTableFor(name: TableName): RecordTable {
  return schema[name];
}
