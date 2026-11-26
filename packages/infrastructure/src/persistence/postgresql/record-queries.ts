import type {
  EvaluationQueueCursor,
  EvaluationSummary,
  HubFeedbackEventPage,
  HubFeedbackRecordQuery,
  ReadyJobsQuery,
  ScenarioReferenceCounts,
} from '@capability-hub/application/ports';
import {
  parseRecord,
  catalogPromptStateId,
  type GitSourceRecord,
  type JobKind,
  type RecordMap,
  type TableName,
} from '@capability-hub/domain/models';
import {
  and,
  count,
  desc,
  eq,
  gt,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  not,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { RecordQueries } from '../record-driver.js';
import { evaluationBackfillCandidates } from '../evaluation-backfill-query.js';
import { evaluationSummaryQuery, parseEvaluationSummaries } from '../evaluation-summary-query.js';
import { resourceActivityQuery } from '../resource-activity-query.js';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { pgRevision, type pgSchema, pgTableFor } from './record-schema.js';
import {
  audit,
  bindings,
  catalog_prompts,
  resource_evaluations,
  hub_feedback,
  hub_feedback_attachments,
  hub_feedback_events,
  jobs,
  releases,
  requests,
  role_bindings,
  scenarios,
  sources,
  users,
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
  async hasUsers(): Promise<boolean> {
    const rows = await this.db
      .select({ present: sql`1` })
      .from(users)
      .limit(1);
    return rows.length > 0;
  }
  async listRunningJobIds(now: number, kind?: JobKind): Promise<string[]> {
    const rows = await this.db
      .select({ id: jobs.id })
      .from(jobs)
      .where(
        and(
          sql`${jobs.data} ->> 'state' = 'running' and (${jobs.data} ->> 'lease_until')::bigint > ${now}`,
          kind ? eq(sql`${jobs.data} ->> 'kind'`, kind) : undefined,
        ),
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
          query.excludeKind ? not(eq(sql`${jobs.data} ->> 'kind'`, query.excludeKind)) : undefined,
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
  async listAiExecutionJobs(executionId: string): Promise<RecordMap['jobs'][]> {
    const rows = await this.db
      .select({ data: jobs.data })
      .from(jobs)
      .where(
        and(eq(jobs.aggregate_id, executionId), sql`${jobs.data} ->> 'kind' = 'ai_execution'`),
      );
    return rows.map(({ data }) => parseRecord('jobs', data));
  }
  async listQueuedEvaluations(
    limit: number,
    excludeSubjects: readonly string[] = [],
    after?: EvaluationQueueCursor,
  ) {
    if (limit <= 0) return [];
    const t = resource_evaluations;
    const page = (position: SQL | undefined, size: number) =>
      this.db
        .select({ data: t.data })
        .from(t)
        .where(
          and(
            eq(t.state, 'queued'),
            position,
            excludeSubjects.length ? not(inArray(t.subject_digest, excludeSubjects)) : undefined,
          ),
        )
        .orderBy(sql`${t.priority} desc nulls last`, t.requested_at, t.id)
        .limit(size);
    // 分开查询同级尾部与更低优先级，让队列索引直接定位游标。
    const rows = await page(
      after
        ? and(
            eq(t.priority, after.priority),
            sql`(${t.requested_at}, ${t.id}) > (${after.requested_at}, ${after.id})`,
          )
        : undefined,
      limit,
    );
    if (after && rows.length < limit)
      rows.push(...(await page(lt(t.priority, after.priority), limit - rows.length)));
    return rows.map(({ data }) => parseRecord('resource_evaluations', data));
  }
  async listRunningEvaluationSubjects() {
    const t = resource_evaluations;
    const rows = await this.db
      .select({ subject: t.subject_digest })
      .from(t)
      .where(eq(t.state, 'running'));
    return rows.map(({ subject }) => subject);
  }
  async listRunningEvaluations() {
    const t = resource_evaluations;
    const rows = await this.db.select({ data: t.data }).from(t).where(eq(t.state, 'running'));
    return rows.map(({ data }) => parseRecord('resource_evaluations', data));
  }
  async listVersionEvaluations(versionId: string) {
    const t = resource_evaluations;
    const rows = await this.db
      .select({ data: t.data })
      .from(t)
      .where(eq(t.version_id, versionId))
      .orderBy(desc(t.requested_at), desc(t.id));
    return rows.map(({ data }) => parseRecord('resource_evaluations', data));
  }
  async listEvaluationSummaries(releaseIds: readonly string[], rubric: string) {
    if (!releaseIds.length) return new Map<string, EvaluationSummary>();
    const query = evaluationSummaryQuery('postgresql', releaseIds, rubric);
    const rows = await this.db
      .select(query.fields)
      .from(query.source)
      .where(query.filter)
      .orderBy(query.position);
    return parseEvaluationSummaries(rows);
  }
  async countManualEvaluations(assetId: string, since: string) {
    const [row] = await this.db
      .select({ total: count() })
      .from(audit)
      .where(
        and(
          gte(audit.occurred_at, since),
          sql`(${audit.data} ->> 'action') = 'evaluation.requested' and (${audit.data} -> 'metadata' ->> 'asset_id') = ${assetId}`,
        ),
      );
    return row.total;
  }
  async nextEvaluationBackfill(rubric: string, evaluator: string | null, since: string) {
    const [row] = await this.db
      .select({ id: sql<string>`candidate.release_id` })
      .from(evaluationBackfillCandidates(rubric, evaluator, since));
    return row?.id;
  }
  async reusableEvaluation(subjectDigest: string, rubric: string, evaluator: string | null) {
    const t = resource_evaluations;
    const [row] = await this.db
      .select({ data: t.data })
      .from(t)
      .where(
        and(
          eq(t.subject_digest, subjectDigest),
          eq(t.rubric_version, rubric),
          sql`${t.state} in ('succeeded', 'partial')`,
          evaluator === null ? isNull(t.evaluator_digest) : eq(t.evaluator_digest, evaluator),
        ),
      )
      .orderBy(
        desc(t.state),
        // 部分完成的结果优先取已成功阶段最多的一条，避免重跑已恢复的阶段。
        sql`case when ${t.state} = 'partial' then (select count(*) from jsonb_array_elements(${t.data} -> 'stages') as stage where stage ->> 'state' = 'succeeded') end desc nulls last`,
        sql`case when ${t.state} = 'partial' then ${t.requested_at} end desc`,
        t.requested_at,
        t.id,
      )
      .limit(1);
    return row && parseRecord('resource_evaluations', row.data);
  }
  async catalogPromptSchedule() {
    const [row] = await this.db
      .select({
        next_refresh_at: catalog_prompts.next_refresh_at,
        active_job_id: catalog_prompts.active_job_id,
      })
      .from(catalog_prompts)
      .where(eq(catalog_prompts.id, catalogPromptStateId));
    return row;
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
    const order: ('blocking' | 'last_activity_at' | 'number')[] = ['last_activity_at', 'number'];
    if (submittedBy === undefined) order.unshift('blocking');
    const totals = this.db
      .select({ total: count().as('total') })
      .from(t)
      .where(filters)
      .as('totals');
    const page = this.db
      .select({
        data: t.data,
        blocking: t.blocking,
        last_activity_at: t.last_activity_at,
        number: t.number,
      })
      .from(t)
      .where(filters)
      .orderBy(...order.map((key) => desc(t[key])))
      .limit(query.limit)
      .offset((query.page - 1) * query.limit)
      .as('page');
    // 总数作左表，越过末页时也在同一快照中返回总数。
    const rows = await this.db
      .select({ total: totals.total, data: page.data })
      .from(totals)
      .leftJoin(page, sql`true`)
      .orderBy(...order.map((key) => desc(page[key])));
    return {
      total: rows[0].total,
      items: rows[0].data === null ? [] : rows.map(({ data }) => parseRecord('hub_feedback', data)),
    };
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
  async listHubFeedbackEvents(
    feedbackId: string,
    publicOnly: boolean,
    page?: HubFeedbackEventPage,
  ) {
    if (page && page.limit <= 0) return [];
    const t = hub_feedback_events;
    const select = this.db
      .select({ data: t.data })
      .from(t)
      .where(
        and(
          eq(t.feedback_id, feedbackId),
          publicOnly ? eq(t.visibility, 'public') : undefined,
          page ? gt(t.sequence, page.afterSequence) : undefined,
        ),
      )
      .orderBy(t.sequence);
    const rows = await (page ? select.limit(page.limit) : select);
    return rows.map(({ data }) => parseRecord('hub_feedback_events', data));
  }
  async listHubFeedbackAttachments(
    feedbackId: string,
    publicOnly: boolean,
    eventIds?: readonly (string | null)[],
  ) {
    if (eventIds?.length === 0) return [];
    const t = hub_feedback_attachments;
    const event = hub_feedback_events;
    const filter = and(
      eq(t.feedback_id, feedbackId),
      eventIds &&
        or(
          inArray(
            t.event_id,
            eventIds.filter((id) => id !== null),
          ),
          eventIds.includes(null) ? isNull(t.event_id) : undefined,
        ),
    );
    const select = this.db.select({ data: t.data }).from(t);
    const rows = publicOnly
      ? await select
          .leftJoin(event, and(eq(t.event_id, event.id), eq(t.feedback_id, event.feedback_id)))
          .where(and(filter, or(isNull(t.event_id), eq(event.visibility, 'public'))))
          .orderBy(t.created_at, t.id)
      : await select.where(filter).orderBy(t.created_at, t.id);
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
