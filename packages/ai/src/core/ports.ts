import type { AiEventType, AiRecordMap, AiTable, ExecutionRecord, Json } from './records.js';

/**
 * `AiQueries.list` 的过滤条件。`limit` 必须显式给出且由调用方负责上限，实现不会自动截断；
 * `after` 是按 `(position, id)` 的稳定游标（配合 `descending` 决定方向），`before_position` 是
 * 水位上限（只取严格小于该位置的行）。两者同时给出时先按水位过滤、再按游标推进，
 * 用于「读到某一时刻为止」的快照式读取。
 */
export interface AiRecordQuery {
  execution_id?: string;
  owner_id?: string;
  lookup_key?: string;
  status?: string;
  /** 按事件类型白名单过滤；空数组不表示「全部」。 */
  event_types?: AiEventType[];
  after?: { position: number; id: string };
  before_position?: number;
  descending?: boolean;
  limit: number;
}

/** 单次模型请求只进入一个时间桶，状态保留完整、部分及待结算用量的区别。 */
export interface TokenUsageBucket {
  bucket: string;
  operation_id: string;
  profile: string;
  owner_id: string;
  owner_label: string | null;
  status: AiRecordMap['ai_calls']['status'];
  requests: number;
  input_tokens: number;
  output_tokens: number;
}

/**
 * 按表读写的通用端口。`insert` 是新增，主键冲突即失败；`put` 是按 `id` 覆盖更新，记录不存在也失败
 * ——两者都不做 upsert，调用方必须先用 `get` 判断存在性。
 */
export interface AiQueries {
  get<K extends AiTable>(table: K, id: string): Promise<AiRecordMap[K] | undefined>;
  list<K extends AiTable>(table: K, query: AiRecordQuery): Promise<AiRecordMap[K][]>;
  summarizeExecutions(): Promise<
    {
      operation_id: string;
      status: ExecutionRecord['status'];
      count: number;
      last_activity_at: string;
    }[]
  >;
  /** 从 from 起按连续 24 小时分组，按创建时间选取截至 through 的执行。 */
  summarizeExecutionDays(
    from: string,
    through: string,
  ): Promise<
    {
      day_index: number;
      operation_id: string;
      status: ExecutionRecord['status'];
      error_code: string | null;
      count: number;
    }[]
  >;
  /** 按北京时间的请求开始时间汇总，from 和 through 均包含在内。 */
  summarizeTokenUsage(
    from: string | null,
    through: string,
    granularity: 'day' | 'month',
  ): Promise<TokenUsageBucket[]>;
  insert<K extends AiTable>(table: K, record: AiRecordMap[K]): Promise<AiRecordMap[K]>;
  put<K extends AiTable>(table: K, record: AiRecordMap[K]): Promise<AiRecordMap[K]>;
  remove(table: AiTable, id: string): Promise<void>;
}

/**
 * AI 持久化端口。`tx` 是唯一的事务边界：传入的 `work` 内所有读写（含嵌套调用 `tx` 的写入层）
 * 都在同一事务里提交或回滚，嵌套 `tx` 复用外层事务而不是另开新事务。
 */
export interface AiStore extends AiQueries {
  tx<T>(work: () => T | Promise<T>): Promise<T>;
}

/**
 * 一次调度权租约。`dispatch_id` 是作业 ID，`owner` 是持有者标识，`attempt` 每轮递增，
 * `epoch` 与作业记录的 `lease_epoch` 比对——三者（外加 execution_id）任一不符即视为租约失效，
 * 因此任何写库操作都应先 {@link AiQueueBridge.assert} 并核对 `dispatch_id`，拿到不匹配即说明
 * 本进程已失去该执行，不能再产生副作用。
 */
export interface ExecutionLease {
  execution_id: string;
  dispatch_id: string;
  owner: string;
  epoch: number;
  attempt: number;
}

/**
 * 队列桥接端口，宿主侧通常由 worker 实现。`enqueue` 返回新的 `dispatch_id` 并把它写回执行记录；
 * `assert` 在租约失效时抛错（通常是 `AI_LEASE_LOST`），是唯一可依赖的抢占检测点；
 * `finish` 必须调用一次以结算派发，`retry` 的 `delayMs` 为 0 表示尽快重排。
 */
export interface AiQueueBridge {
  enqueue(executionId: string): Promise<string>;
  assert(lease: ExecutionLease): Promise<void>;
  cancel(dispatchId: string): Promise<void>;
  finish(lease: ExecutionLease, status: 'succeeded' | 'failed'): Promise<void>;
  retry(lease: ExecutionLease, delayMs: number): Promise<void>;
}

/**
 * 授权端口，agent 与人工共用同一套 RBAC 判定。实现必须在拒绝时抛错（不得返回布尔值），
 * 且同一执行内可被多次调用：`execute` 在每个步骤前后各校验一次，`tool`/`resource` 在每次
 * 工具调用或资源读取前校验，因此权限在执行中途被收回会立即中断后续步骤。
 */
export interface AiAuthorization {
  authorize(
    ownerId: string,
    action: 'submit' | 'execute' | 'read' | 'respond' | 'cancel' | 'tool' | 'resource',
    execution?: ExecutionRecord,
    target?: string | { response: unknown },
  ): Promise<void>;
}

/**
 * 凭据解析端口。返回值是明文密钥，只能在构造请求头时内联使用，禁止写入日志、事件或执行记录；
 * 引用格式是环境变量式的大写名称，解析失败应抛错而不是返回空串。
 */
export interface CredentialResolver {
  resolve(reference: string): Promise<string>;
}

/**
 * 一次资源快照。`version` 与 `digest` 用于告诉模型这段内容对应哪个不可变版本，
 * 引用时必须原样回填，宿主据此校验引用没有指向更新的内容。
 */
export interface AiResource {
  id: string;
  version: string;
  digest: string;
  title: string;
  text: string;
}

/** 资源解析端口；`reference` 由模型给出，实现必须做权限与路径校验，并响应 `signal` 取消。 */
export interface ResourceResolver {
  resolve(ownerId: string, reference: string, signal: AbortSignal): Promise<AiResource>;
}

/**
 * 遥测端口。`record` 是同步回调，调用方的 try/catch 会吞掉它抛出的异常——遥测故障不得改变
 * 已经落库的执行结果，但也不提供重试；`attributes` 只接受 JSON，不得携带凭据、模型原文或资源正文。
 */
export interface AiTelemetry {
  record(event: {
    execution_id: string;
    name: string;
    duration_ms: number;
    attributes: Record<string, Json>;
  }): void;
}
