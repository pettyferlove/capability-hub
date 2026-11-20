import type {
  GitSourceRecord,
  HubFeedbackArea,
  HubFeedbackAttachmentRecord,
  HubFeedbackChannel,
  HubFeedbackEventRecord,
  HubFeedbackKind,
  HubFeedbackRecord,
  HubFeedbackStatus,
  HubFeedbackSurface,
  JobKind,
  RecordMap,
  TableName,
} from '@capability-hub/domain/models';

/** 就绪筛选复用租约检查的时间快照，并限制返回剩余名额。 */
export interface ReadyJobsQuery {
  now: number;
  limit: number;
  excludeIds: readonly string[];
  kinds?: readonly JobKind[];
}

/** 北京时间的日桶只返回计数，审计明细和反馈正文留在各自读取边界内。 */
export interface ResourceActivityBucket {
  date: string;
  metric:
    | 'first_releases'
    | 'repeat_releases'
    | 'downloads'
    | 'skill_loads'
    | 'install_requests'
    | 'feedback_pending'
    | 'feedback_in_progress'
    | 'feedback_resolved'
    | 'feedback_declined';
  count: number;
}

/** 同一条记录只计一次；同名待审定义归入发布申请，合并关系计入两端。 */
export interface ScenarioReferenceCounts {
  publication_requests: number;
  releases: number;
  source_targets: number;
  role_bindings: number;
  merges: number;
}

export interface HubFeedbackRecordQuery {
  submittedBy?: string;
  status: HubFeedbackStatus | 'open' | 'closed' | 'all';
  kind?: HubFeedbackKind;
  surface?: HubFeedbackSurface;
  area?: HubFeedbackArea;
  channel?: HubFeedbackChannel;
  assignee?: string | null;
  awaiting?: boolean;
  q?: string;
  page: number;
  limit: number;
}

/**
 * 持久化调用统一异步，嵌套操作共享同一事务。
 *
 * 实现方必须保证的语义：
 * - `tx` 可嵌套：内层直接加入外层，最外层结束才提交，中途抛错回滚其全部写入。
 * - 未显式 `tx` 的调用各自独立，实现通常串行化到单个连接，因此**没有行级锁**；
 *   跨读取的并发安全只能靠记录自增 `revision` 加乐观校验（见 `matchRevision`）。
 * - `insert`/`put`/`remove`/`audit` 自带（可嵌套的）事务，可在外层事务里直接调用。
 */
export interface RecordStore {
  readonly kind: 'sqlite' | 'postgresql';
  /** `id` 为空时返回 `undefined` 而不是抛错，便于按可选外键查询。 */
  get<K extends TableName>(
    table: K,
    id: string | null | undefined,
  ): Promise<RecordMap[K] | undefined>;
  all<K extends TableName>(table: K): Promise<RecordMap[K][]>;
  /** 调度查询在数据库内筛选，历史任务正文不进入轮询路径。 */
  listRunningJobIds(now: number): Promise<string[]>;
  listReadyJobs(query: ReadyJobsQuery): Promise<RecordMap['jobs'][]>;
  listCancellationRequestedJobs(): Promise<RecordMap['jobs'][]>;
  listDueSources(now: number): Promise<GitSourceRecord[]>;
  countScenarioReferences(id: string): Promise<ScenarioReferenceCounts | undefined>;
  findHubFeedback(
    ref: string | number,
    submittedBy?: string,
  ): Promise<HubFeedbackRecord | undefined>;
  listHubFeedback(
    query: HubFeedbackRecordQuery,
  ): Promise<{ items: HubFeedbackRecord[]; total: number }>;
  summarizeHubFeedbackForSubmitter(submittedBy: string): Promise<{ unread: number; open: number }>;
  summarizeHubFeedbackForHandler(
    assigneeId: string,
  ): Promise<{ pending: number; awaiting_reply: number; assigned_to_me: number }>;
  listHubFeedbackEvents(feedbackId: string, publicOnly: boolean): Promise<HubFeedbackEventRecord[]>;
  listHubFeedbackAttachments(
    feedbackId: string,
    publicOnly: boolean,
  ): Promise<HubFeedbackAttachmentRecord[]>;
  /** 编号与序列必须在写入该记录的同一事务内分配。 */
  nextHubFeedbackNumber(): Promise<number>;
  nextHubFeedbackEventSequence(feedbackId: string): Promise<number>;
  countRecentHubFeedback(submittedBy: string, since: string): Promise<number>;
  countRecentHubFeedbackComments(actorId: string, since: string): Promise<number>;
  summarizeHubFeedbackAttachments(feedbackId: string): Promise<{ count: number; size: number }>;
  listExpiredHubFeedbackAttachments(
    before: string,
    limit: number,
  ): Promise<HubFeedbackAttachmentRecord[]>;
  /** 无索引保证，返回顺序由驱动决定，需要稳定顺序时调用方自行排序。 */
  where<K extends TableName>(
    table: K,
    key: keyof RecordMap[K] & string,
    value: string,
  ): Promise<RecordMap[K][]>;
  /** 取 `where` 的第一条；多条匹配时结果依赖驱动返回顺序。 */
  find<K extends TableName>(
    table: K,
    key: keyof RecordMap[K] & string,
    value: string,
  ): Promise<RecordMap[K] | undefined>;
  /** 主键已存在即抛错（HTTP 层映射为 409），不会静默覆盖。 */
  insert<K extends TableName>(table: K, record: RecordMap[K]): Promise<RecordMap[K]>;
  /** 按 `id` 整条覆盖已有记录，未给出的字段不保留；记录不存在即抛错，不做 upsert。 */
  put<K extends TableName>(table: K, record: RecordMap[K]): Promise<RecordMap[K]>;
  /** 删除不存在的记录视为成功，便于重试。 */
  remove(table: TableName, id: string): Promise<void>;
  /** 事务边界；嵌套时沿用外层作用域与串行队列，不会另开独立事务。 */
  tx<T>(work: () => T | Promise<T>): Promise<T>;
  /**
   * 写一条审计记录并顺带固化操作者与对象的展示快照；结果类别与对象类型由
   * `auditDefinitions[action]` 推导，因此 `action` 必须是已登记的动作名。
   */
  audit(
    actor: string,
    action: string,
    entityId: string,
    reason?: string,
    metadata?: Record<string, unknown>,
  ): Promise<void>;
  /** 全局修订号（字符串比较），随写入变化，用作缓存键；不可当作并发令牌或单调数值。 */
  revision(): Promise<string>;
  /** 当前数据库占用的字节数；SQLite 按数据库页计量。 */
  sizeBytes(): Promise<number>;
  summarizeResourceActivity(from: string, through: string): Promise<ResourceActivityBucket[]>;
  /** 每个资产、每种指定动作只返回最近时间，不读取审计正文。 */
  summarizeAssetAuditActivity(
    actions: string[],
  ): Promise<{ asset_id: string; action: string; occurred_at: string }[]>;
  health(): Promise<void>;
  close(): Promise<void>;
}
