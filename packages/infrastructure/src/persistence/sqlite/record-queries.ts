import type { ReadyJobsQuery, ScenarioReferenceCounts } from '@capability-hub/application/ports';
import {
  parseRecord,
  type GitSourceRecord,
  type RecordMap,
  type TableName,
} from '@capability-hub/domain/models';
import { and, count, eq, gt, inArray, lte, not, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import type { RecordQueries } from '../record-driver.js';
import { resourceActivityQuery } from '../resource-activity-query.js';
import type { SqliteRemoteDatabase } from 'drizzle-orm/sqlite-proxy';
import { sqliteRevision, type sqliteSchema, sqliteTableFor } from './record-schema.js';
import {
  audit,
  bindings,
  jobs,
  releases,
  requests,
  role_bindings,
  scenarios,
  sources,
} from './schema.js';

type Session = Pick<
  SqliteRemoteDatabase<typeof sqliteSchema>,
  'select' | 'insert' | 'update' | 'delete' | 'run'
>;

/**
 * `RecordQueries` 的 SQLite 实现：记录正文经过 `parseRecord` 校验，约束与生成列交给 Schema。
 *
 * 调度查询先在数据库内筛选，只解析命中的正文；通用 `where` 用 `json_extract` 查询内部字段，
 * 无生成列索引保证。`put` 依 `returning` 的行数判断目标是否存在，缺失时抛 `Error`（不是 no-op）。
 * 本类不管理事务与并发——事务由驱动提供，串行化由执行器池保证。
 */
export class SqliteQueries implements RecordQueries {
  constructor(private readonly db: Session) {}
  async get<K extends TableName>(table: K, id: string | null | undefined) {
    const relation = sqliteTableFor(table);
    const rows = await this.db
      .select({ data: relation.data })
      .from(relation)
      .where(eq(relation.id, id ?? ''))
      .limit(1);
    return rows[0] ? parseRecord(table, rows[0].data) : undefined;
  }
  async all<K extends TableName>(table: K): Promise<RecordMap[K][]> {
    const relation = sqliteTableFor(table);
    const rows = await this.db.select({ data: relation.data }).from(relation).orderBy(relation.id);
    return rows.map((row) => parseRecord(table, row.data));
  }
  async listRunningJobIds(now: number): Promise<string[]> {
    const rows = await this.db
      .select({ id: jobs.id })
      .from(jobs)
      .where(
        and(eq(jobs.state, 'running'), gt(sql`json_extract(${jobs.data}, '$.lease_until')`, now)),
      );
    return rows.map((row) => row.id);
  }
  async listReadyJobs(query: ReadyJobsQuery): Promise<RecordMap['jobs'][]> {
    if (query.kinds?.length === 0 || query.limit <= 0) return [];
    const rows = await this.db
      .select({ data: jobs.data })
      .from(jobs)
      .where(
        and(
          or(
            and(eq(jobs.state, 'queued'), lte(jobs.run_after, query.now)),
            and(
              eq(jobs.state, 'running'),
              lte(sql`json_extract(${jobs.data}, '$.lease_until')`, query.now),
            ),
          ),
          eq(sql`json_extract(${jobs.data}, '$.cancel_requested')`, 0),
          query.excludeIds.length ? not(inArray(jobs.id, query.excludeIds)) : undefined,
          query.kinds ? inArray(sql`json_extract(${jobs.data}, '$.kind')`, query.kinds) : undefined,
        ),
      )
      .orderBy(jobs.run_after, jobs.id)
      .limit(query.limit);
    return rows.map((row) => parseRecord('jobs', row.data));
  }
  async listCancellationRequestedJobs(): Promise<RecordMap['jobs'][]> {
    const rows = await this.db
      .select({ data: jobs.data })
      .from(jobs)
      .where(
        and(
          inArray(jobs.state, ['queued', 'running']),
          eq(sql`json_extract(${jobs.data}, '$.cancel_requested')`, 1),
        ),
      )
      .orderBy(jobs.id);
    return rows.map((row) => parseRecord('jobs', row.data));
  }
  async listDueSources(now: number): Promise<GitSourceRecord[]> {
    const rows = await this.db
      .select({ data: sources.data })
      .from(sources)
      .where(
        and(
          eq(sql`json_extract(${sources.data}, '$.kind')`, 'git'),
          eq(sql`json_extract(${sources.data}, '$.state')`, 'active'),
          sql`json_extract(${sources.data}, '$.distribution_revoked_at') is null`,
          lte(sql`json_extract(${sources.data}, '$.next_poll_at')`, now),
        ),
      )
      .orderBy(sources.id);
    return rows.map((row) => {
      const source = parseRecord('sources', row.data);
      if (source.kind !== 'git') throw new Error('Expected Git source');
      return source;
    });
  }
  async countScenarioReferences(id: string): Promise<ScenarioReferenceCounts | undefined> {
    const publicationRequests = this.db.select({ count: count() }).from(requests).where(sql`exists (
        select 1 from json_each(${requests.data}, '$.scenario_ids') as selected
        where selected.value = ${scenarios.id}
      ) or (
        json_extract(${requests.data}, '$.state') = 'pending' and exists (
          select 1 from json_each(${requests.data}, '$.proposed_scenarios') as proposed
          where json_extract(proposed.value, '$.name') = ${scenarios.name}
        )
      )`);
    const releaseReferences = this.db.select({ count: count() }).from(releases).where(sql`exists (
        select 1 from json_each(${releases.data}, '$.scenario_ids') as selected
        where selected.value = ${scenarios.id}
      )`);
    const sourceTargets = this.db.select({ count: count() }).from(bindings).where(sql`exists (
        select 1 from json_each(${bindings.data}, '$.scenario_ids') as selected
        where selected.value = ${scenarios.id}
      )`);
    const roleBindings = this.db.select({ count: count() }).from(role_bindings)
      .where(sql`json_extract(${role_bindings.data}, '$.scope_type') = 'scenario'
        and json_extract(${role_bindings.data}, '$.scope_id') = ${scenarios.id}`);
    const merged = alias(scenarios, 'merged');
    const mergedInto = sql`json_extract(${merged.data}, '$.merged_into')`;
    const merges = this.db.select({ count: count() }).from(merged)
      .where(sql`${mergedInto} = ${scenarios.id}
        or (${merged.id} = ${scenarios.id} and ${mergedInto} is not null)`);
    const [references] = await this.db
      .select({
        publication_requests: sql`(${publicationRequests})`.mapWith(Number),
        releases: sql`(${releaseReferences})`.mapWith(Number),
        source_targets: sql`(${sourceTargets})`.mapWith(Number),
        role_bindings: sql`(${roleBindings})`.mapWith(Number),
        merges: sql`(${merges})`.mapWith(Number),
      })
      .from(scenarios)
      .where(eq(scenarios.id, id));
    return references;
  }
  async where<K extends TableName>(
    table: K,
    key: keyof RecordMap[K] & string,
    value: string,
  ): Promise<RecordMap[K][]> {
    const relation = sqliteTableFor(table);
    const rows = await this.db
      .select({ data: relation.data })
      .from(relation)
      .where(sql`json_extract(${relation.data}, ${'$.' + key}) = ${value}`)
      .orderBy(relation.id);
    return rows.map((row) => parseRecord(table, row.data));
  }
  async insert<K extends TableName>(table: K, record: RecordMap[K]): Promise<RecordMap[K]> {
    const value = parseRecord(table, record);
    await this.db.insert(sqliteTableFor(table)).values({ id: value.id, data: value });
    return value;
  }
  async put<K extends TableName>(table: K, record: RecordMap[K]): Promise<RecordMap[K]> {
    const value = parseRecord(table, record);
    const relation = sqliteTableFor(table);
    const rows = await this.db
      .update(relation)
      .set({ data: value })
      .where(eq(relation.id, value.id))
      .returning({ id: relation.id });
    if (rows.length !== 1) throw new Error('Missing row');
    return value;
  }
  async remove(table: TableName, id: string): Promise<void> {
    const relation = sqliteTableFor(table);
    await this.db.delete(relation).where(eq(relation.id, id));
  }
  async revision(): Promise<string> {
    const [row] = await this.db
      .select({ revision: sqliteRevision.revision })
      .from(sqliteRevision)
      .where(eq(sqliteRevision.id, 1));
    return String(row.revision);
  }
  async health(): Promise<void> {
    await this.db.run(sql`select 1`);
  }
  async sizeBytes(): Promise<number> {
    const [row] = await this.db
      .select({ bytes: sql<number>`page_count * page_size` })
      .from(sql`pragma_page_count(), pragma_page_size()`);
    return row.bytes;
  }
  async summarizeResourceActivity(from: string, through: string) {
    const { fields, source, range, group } = resourceActivityQuery('sqlite', from, through);
    return await this.db
      .select(fields)
      .from(source)
      .where(range)
      .groupBy(...group);
  }
  async summarizeAssetAuditActivity(actions: string[]) {
    const assetId = sql<string>`coalesce(json_extract(${audit.data}, '$.subject.asset_id'), json_extract(${audit.data}, '$.entity_id'))`;
    const action = sql<string>`json_extract(${audit.data}, '$.action')`;
    return await this.db
      .select({
        asset_id: assetId,
        action,
        occurred_at: sql<string>`max(${audit.occurred_at})`,
      })
      .from(audit)
      .where(inArray(action, actions))
      .groupBy(assetId, action);
  }
}
