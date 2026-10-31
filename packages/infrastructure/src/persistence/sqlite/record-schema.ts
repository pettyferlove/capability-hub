import type { RecordMap, TableName } from '@capability-hub/domain/models';
import type { SQLiteColumn, SQLiteTableWithColumns } from 'drizzle-orm/sqlite-core';
import * as schema from './schema.js';

// 通用记录查询只暴露可写的 id/data；表、生成列和约束始终取自完整 Schema。
type ColumnConfig<C> = C extends SQLiteColumn<infer Config> ? Config : never;
type RecordTable = SQLiteTableWithColumns<{
  name: TableName;
  schema: undefined;
  dialect: 'sqlite';
  columns: {
    id: SQLiteColumn<
      Omit<ColumnConfig<typeof schema.users.id>, 'tableName'> & { tableName: TableName }
    >;
    data: SQLiteColumn<
      Omit<ColumnConfig<typeof schema.users.data>, 'tableName' | 'data'> & {
        tableName: TableName;
        data: RecordMap[TableName];
      }
    >;
  };
}>;
export const sqliteRevision = schema.hub_revision;
export const sqliteSchema = schema;

export function sqliteTableFor(name: TableName): RecordTable {
  return schema[name];
}
