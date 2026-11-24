import type {
  EvaluationQueueCursor,
  HubFeedbackEventPage,
  HubFeedbackRecordQuery,
  ReadyJobsQuery,
  ScenarioReferenceCounts,
} from '@capability-hub/application/ports';
import {
  parseRecord,
  parseStoredRecord,
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
import { alias } from 'drizzle-orm/sqlite-core';
import type { RecordQueries } from '../record-driver.js';
import { evaluationBackfillCandidates } from '../evaluation-backfill-query.js';
import { resourceActivityQuery } from '../resource-activity-query.js';
import type { SqliteRemoteDatabase } from 'drizzle-orm/sqlite-proxy';
import { sqliteRevision, type sqliteSchema, sqliteTableFor } from './record-schema.js';
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
    return rows[0] ? parseStoredRecord(table, rows[0].data) : undefined;
  }
  async all<K extends TableName>(table: K): Promise<RecordMap[K][]> {
    const relation = sqliteTableFor(table);
    const rows = await this.db.select({ data: relation.data }).from(relation).orderBy(relation.id);
    return rows.map((row) => parseStoredRecord(table, row.data));
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
          eq(jobs.state, 'running'),
          gt(sql`json_extract(${jobs.data}, '$.lease_until')`, now),
          kind ? eq(sql`json_extract(${jobs.data}, '$.kind')`, kind) : undefined,
        ),
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
          query.excludeKind
            ? not(eq(sql`json_extract(${jobs.data}, '$.kind')`, query.excludeKind))
            : undefined,
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
  async listAiExecutionJobs(executionId: string): Promise<RecordMap['jobs'][]> {
    const rows = await this.db
      .select({ data: jobs.data })
      .from(jobs)
      .where(
        and(
          eq(jobs.aggregate_id, executionId),
          sql`json_extract(${jobs.data}, '$.kind') = 'ai_execution'`,
        ),
      );
    return rows.map(({ data }) => parseRecord('jobs', data));
  }
  async listQueuedEvaluations(
    limit: number,
    excludeSubjects: readonly string[] = [],
    after?: EvaluationQueueCursor,
    staticOnly = false,
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
            staticOnly ? isNull(t.evaluator_digest) : undefined,
            excludeSubjects.length ? not(inArray(t.subject_digest, excludeSubjects)) : undefined,
          ),
        )
        .orderBy(desc(t.priority), t.requested_at, t.id)
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
    return rows.map(({ data }) => parseStoredRecord('resource_evaluations', data));
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
    return rows.map(({ data }) => parseStoredRecord('resource_evaluations', data));
  }
  async listVersionEvaluations(versionId: string) {
    const t = resource_evaluations;
    const rows = await this.db
      .select({ data: t.data })
      .from(t)
      .where(eq(t.version_id, versionId))
      .orderBy(desc(t.requested_at), desc(t.id));
    return rows.map(({ data }) => parseStoredRecord('resource_evaluations', data));
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
        sql`case when ${t.state} = 'partial' then (select count(*) from json_each(${t.data}, '$.stages') where json_extract(value, '$.state') = 'succeeded') end desc`,
        sql`case when ${t.state} = 'partial' then ${t.requested_at} end desc`,
        t.requested_at,
        t.id,
      )
      .limit(1);
    return row && parseStoredRecord('resource_evaluations', row.data);
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
  async findHubFeedback(ref: string | number, submittedBy?: string) {
    const t = hub_feedback;
    const [row] = await this.db
      .select({ data: t.data })
      .from(t)
      .where(
        and(
          typeof ref === 'number' ? eq(t.number, ref) : eq(t.id, ref),
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
            sql`instr(lower(${t.data} ->> 'title'), lower(${q})) > 0`,
            sql`instr(lower(${t.data} ->> 'description'), lower(${q})) > 0`,
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
    const relation = sqliteTableFor(table);
    const rows = await this.db
      .select({ data: relation.data })
      .from(relation)
      .where(sql`json_extract(${relation.data}, ${'$.' + key}) = ${value}`)
      .orderBy(relation.id);
    return rows.map((row) => parseStoredRecord(table, row.data));
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
