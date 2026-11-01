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

/**
 * 单行（`id = 1`）的全局版本计数器，由迁移安装的触发器在业务表写入后自增，
 * 供缓存与同步判断数据是否发生变化。
 */
export const pgRevision = schema.hub_revision;

/** PostgreSQL 方言的全量 Schema 再导出，迁移与 AI 表定义共用这一份。 */
export const pgSchema = schema;

/**
 * 按表名取「只有 id/data 两列」的视图。通用记录查询依赖它把写入范围收窄到 `data`：
 * 生成列与约束不在此类型里出现，因此调用方无法通过通用接口绕过 Schema 直接写索引列。
 */
export function pgTableFor(name: TableName): RecordTable {
  return schema[name];
}
