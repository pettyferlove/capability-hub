import type {
  HubFeedbackRecordQuery,
  ReadyJobsQuery,
  ScenarioReferenceCounts,
} from '@capability-hub/application/ports';
import {
  parseRecord,
  type GitSourceRecord,
  type RecordMap,
  type TableName,
} from '@capability-hub/domain/models';
import {
  and,
  count,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lte,
  not,
  or,
  sql,
} from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { RecordQueries } from '../record-driver.js';
import { resourceActivityQuery } from '../resource-activity-query.js';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { pgRevision, type pgSchema, pgTableFor } from './record-schema.js';
import {
  audit,
  bindings,
  hub_feedback,
  hub_feedback_attachments,
  hub_feedback_events,
  jobs,
  releases,
  requests,
  role_bindings,
  scenarios,
  sources,
} from './schema.js';

const feedbackOpen = isNull(hub_feedback.closed_at);
const feedbackClosed = isNotNull(hub_feedback.closed_at);
const feedbackAwaiting = sql`${hub_feedback.awaiting_reply} = true`;

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
  async listRunningJobIds(now: number): Promise<string[]> {
    const rows = await this.db
      .select({ id: jobs.id })
      .from(jobs)
      .where(
        sql`${jobs.data} ->> 'state' = 'running' and (${jobs.data} ->> 'lease_until')::bigint > ${now}`,
      )
      .orderBy(jobs.id);
    return rows.map((row) => row.id);
  }
  async listReadyJobs(query: ReadyJobsQuery): Promise<RecordMap['jobs'][]> {
    if (query.limit <= 0 || query.kinds?.length === 0) return [];
    const runAfter = sql`(${jobs.data} ->> 'run_after')::bigint`;
    const rows = await this.db
      .select({ data: jobs.data })
      .from(jobs)
      .where(
        and(
          sql`(${jobs.data} ->> 'cancel_requested')::boolean = false`,
          sql`((${jobs.data} ->> 'state' = 'queued' and ${runAfter} <= ${query.now})
            or (${jobs.data} ->> 'state' = 'running' and (${jobs.data} ->> 'lease_until')::bigint <= ${query.now}))`,
          query.excludeIds.length ? not(inArray(jobs.id, query.excludeIds)) : undefined,
          query.kinds ? inArray(sql`${jobs.data} ->> 'kind'`, query.kinds) : undefined,
        ),
      )
      .orderBy(runAfter, jobs.id)
      .limit(query.limit);
    return rows.map((row) => parseRecord('jobs', row.data));
  }
  async listCancellationRequestedJobs(): Promise<RecordMap['jobs'][]> {
    const rows = await this.db
      .select({ data: jobs.data })
      .from(jobs)
      .where(
        sql`(${jobs.data} ->> 'cancel_requested')::boolean = true and ${jobs.data} ->> 'state' in ('queued', 'running')`,
      )
      .orderBy(jobs.id);
    return rows.map((row) => parseRecord('jobs', row.data));
  }
  async listDueSources(now: number): Promise<GitSourceRecord[]> {
    const rows = await this.db
      .select({ data: sources.data })
      .from(sources)
      .where(
        sql`${sources.data} ->> 'kind' = 'git'
          and ${sources.data} ->> 'state' = 'active'
          and ${sources.data} ->> 'distribution_revoked_at' is null
          and (${sources.data} ->> 'next_poll_at')::bigint <= ${now}`,
      )
      .orderBy(sources.id);
    return rows
      .map((row) => parseRecord('sources', row.data))
      .filter((source): source is GitSourceRecord => source.kind === 'git');
  }
  async countScenarioReferences(id: string): Promise<ScenarioReferenceCounts | undefined> {
    const publicationRequests = this.db.select({ count: count() }).from(requests)
      .where(sql`${requests.data} -> 'scenario_ids' ? ${scenarios.id}
        or (${requests.data} ->> 'state' = 'pending'
          and ${requests.data} -> 'proposed_scenarios'
            @> jsonb_build_array(jsonb_build_object('name', ${scenarios.name})))`);
    const releaseReferences = this.db
      .select({ count: count() })
      .from(releases)
      .where(sql`${releases.data} -> 'scenario_ids' ? ${scenarios.id}`);
    const sourceTargets = this.db
      .select({ count: count() })
      .from(bindings)
      .where(sql`${bindings.data} -> 'scenario_ids' ? ${scenarios.id}`);
    const roleBindings = this.db.select({ count: count() }).from(role_bindings)
      .where(sql`${role_bindings.data} ->> 'scope_type' = 'scenario'
        and ${role_bindings.data} ->> 'scope_id' = ${scenarios.id}`);
    const merged = alias(scenarios, 'merged');
    const mergedInto = sql`${merged.data} ->> 'merged_into'`;
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
  async findHubFeedback(ref: string | number, submittedBy?: string) {
    const t = hub_feedback;
    const [row] = await this.db
      .select({ data: t.data })
      .from(t)
      .where(
        and(
          typeof ref === 'number' ? sql`${t.number} = ${ref}::bigint` : eq(t.id, ref),
          submittedBy === undefined ? undefined : eq(t.submitted_by, submittedBy),
        ),
      )
      .limit(1);
    return row && parseRecord('hub_feedback', row.data);
  }
  async listHubFeedback(query: HubFeedbackRecordQuery) {
    const t = hub_feedback;
    const { status, submittedBy, kind, surface, area, channel, assignee, awaiting, q } = query;
    const filters = and(
      submittedBy === undefined ? undefined : eq(t.submitted_by, submittedBy),
      status === 'all'
        ? undefined
        : status === 'open'
          ? feedbackOpen
          : status === 'closed'
            ? feedbackClosed
            : eq(t.status, status),
      kind === undefined ? undefined : eq(t.kind, kind),
      surface === undefined ? undefined : eq(t.surface, surface),
      area === undefined ? undefined : eq(t.area, area),
      channel === undefined ? undefined : eq(t.channel, channel),
      assignee === null
        ? isNull(t.assignee_id)
        : assignee === undefined
          ? undefined
          : eq(t.assignee_id, assignee),
      awaiting === undefined ? undefined : awaiting ? feedbackAwaiting : not(feedbackAwaiting),
      q
        ? or(
            sql`strpos(lower(${t.data} ->> 'title'), lower(${q})) > 0`,
            sql`strpos(lower(${t.data} ->> 'description'), lower(${q})) > 0`,
          )
        : undefined,
    );
    const order = [desc(t.last_activity_at), desc(t.number)];
    if (submittedBy === undefined) order.unshift(desc(t.blocking));
    const [total] = await this.db.select({ value: count() }).from(t).where(filters);
    const rows = await this.db
      .select({ data: t.data })
      .from(t)
      .where(filters)
      .orderBy(...order)
      .limit(query.limit)
      .offset((query.page - 1) * query.limit);
    return { items: rows.map(({ data }) => parseRecord('hub_feedback', data)), total: total.value };
  }
  async summarizeHubFeedbackForSubmitter(submittedBy: string) {
    const t = hub_feedback;
    const [summary] = await this.db
      .select({
        unread:
          sql`count(*) filter (where ${t.last_handler_public_at} > ${t.submitter_seen_at})`.mapWith(
            Number,
          ),
        open: sql`count(*) filter (where ${feedbackOpen})`.mapWith(Number),
      })
      .from(t)
      .where(eq(t.submitted_by, submittedBy));
    return summary;
  }
  async summarizeHubFeedbackForHandler(assigneeId: string) {
    const t = hub_feedback;
    const [summary] = await this.db
      .select({
        pending: sql`count(*) filter (where ${eq(t.status, 'pending')})`.mapWith(Number),
        awaiting_reply: sql`count(*) filter (where ${feedbackAwaiting})`.mapWith(Number),
        assigned_to_me:
          sql`count(*) filter (where ${feedbackOpen} and ${eq(t.assignee_id, assigneeId)})`.mapWith(
            Number,
          ),
      })
      .from(t);
    return summary;
  }
  async listHubFeedbackEvents(feedbackId: string, publicOnly: boolean) {
    const t = hub_feedback_events;
    const rows = await this.db
      .select({ data: t.data })
      .from(t)
      .where(
        and(eq(t.feedback_id, feedbackId), publicOnly ? eq(t.visibility, 'public') : undefined),
      )
      .orderBy(t.sequence);
    return rows.map(({ data }) => parseRecord('hub_feedback_events', data));
  }
  async listHubFeedbackAttachments(feedbackId: string, publicOnly: boolean) {
    const t = hub_feedback_attachments;
    const event = hub_feedback_events;
    const select = this.db.select({ data: t.data }).from(t);
    const rows = publicOnly
      ? await select
          .leftJoin(event, and(eq(t.event_id, event.id), eq(t.feedback_id, event.feedback_id)))
          .where(
            and(
              eq(t.feedback_id, feedbackId),
              or(isNull(t.event_id), eq(event.visibility, 'public')),
            ),
          )
          .orderBy(t.created_at, t.id)
      : await select.where(eq(t.feedback_id, feedbackId)).orderBy(t.created_at, t.id);
    return rows.map(({ data }) => parseRecord('hub_feedback_attachments', data));
  }
  async nextHubFeedbackNumber() {
    const t = hub_feedback;
    const [row] = await this.db
      .select({ number: t.number })
      .from(t)
      .orderBy(desc(t.number))
      .limit(1);
    return (row?.number ?? 0) + 1;
  }
  async nextHubFeedbackEventSequence(feedbackId: string) {
    const t = hub_feedback_events;
    const [row] = await this.db
      .select({ sequence: t.sequence })
      .from(t)
      .where(eq(t.feedback_id, feedbackId))
      .orderBy(desc(t.sequence))
      .limit(1);
    return (row?.sequence ?? 0) + 1;
  }
  async countRecentHubFeedback(submittedBy: string, since: string) {
    const t = hub_feedback;
    const [row] = await this.db
      .select({ value: count() })
      .from(t)
      .where(and(eq(t.submitted_by, submittedBy), gte(t.created_at, since)));
    return row.value;
  }
  async countRecentHubFeedbackComments(actorId: string, since: string) {
    const t = hub_feedback_events;
    const [row] = await this.db
      .select({ value: count() })
      .from(t)
      .where(and(eq(t.actor_id, actorId), eq(t.kind, 'comment'), gte(t.created_at, since)));
    return row.value;
  }
  async summarizeHubFeedbackAttachments(feedbackId: string) {
    const t = hub_feedback_attachments;
    const [summary] = await this.db
      .select({ count: count(), size: sql`coalesce(sum(${t.size}), 0)`.mapWith(Number) })
      .from(t)
      .where(and(eq(t.feedback_id, feedbackId), isNotNull(t.sha256)));
    return summary;
  }
  async listExpiredHubFeedbackAttachments(before: string, limit: number) {
    const t = hub_feedback_attachments;
    const rows = await this.db
      .select({ data: t.data })
      .from(t)
      .innerJoin(hub_feedback, eq(t.feedback_id, hub_feedback.id))
      .where(and(lte(hub_feedback.closed_at, before), isNotNull(t.sha256)))
      .orderBy(hub_feedback.closed_at, t.id)
      .limit(limit);
    return rows.map(({ data }) => parseRecord('hub_feedback_attachments', data));
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
  async summarizeResourceActivity(from: string, through: string) {
    const { fields, source, range, group } = resourceActivityQuery('postgresql', from, through);
    return await this.db
      .select(fields)
      .from(source)
      .where(range)
      .groupBy(...group);
  }
  async summarizeAssetAuditActivity(actions: string[]) {
    const assetId = sql<string>`coalesce(${audit.data} -> 'subject' ->> 'asset_id', ${audit.data} ->> 'entity_id')`;
    const action = sql<string>`${audit.data} ->> 'action'`;
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
