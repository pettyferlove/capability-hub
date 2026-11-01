import type { AiEventType, AiRecordMap, AiTable, ExecutionRecord, Json } from './records.js';

export interface AiRecordQuery {
  execution_id?: string;
  owner_id?: string;
  lookup_key?: string;
  status?: string;
  event_types?: AiEventType[];
  after?: { position: number; id: string };
  before_position?: number;
  descending?: boolean;
  limit: number;
}
export interface AiQueries {
  get<K extends AiTable>(table: K, id: string): Promise<AiRecordMap[K] | undefined>;
  list<K extends AiTable>(table: K, query: AiRecordQuery): Promise<AiRecordMap[K][]>;
  insert<K extends AiTable>(table: K, record: AiRecordMap[K]): Promise<AiRecordMap[K]>;
  put<K extends AiTable>(table: K, record: AiRecordMap[K]): Promise<AiRecordMap[K]>;
  remove(table: AiTable, id: string): Promise<void>;
}
export interface AiStore extends AiQueries {
  tx<T>(work: () => T | Promise<T>): Promise<T>;
}
export interface ExecutionLease {
  execution_id: string;
  dispatch_id: string;
  owner: string;
  epoch: number;
  attempt: number;
}
export interface AiQueueBridge {
  enqueue(executionId: string): Promise<string>;
  assert(lease: ExecutionLease): Promise<void>;
  cancel(dispatchId: string): Promise<void>;
  finish(lease: ExecutionLease, status: 'succeeded' | 'failed'): Promise<void>;
  retry(lease: ExecutionLease, delayMs: number): Promise<void>;
}
export interface AiAuthorization {
  authorize(
    ownerId: string,
    action: 'submit' | 'execute' | 'read' | 'respond' | 'cancel' | 'tool' | 'resource',
    execution?: ExecutionRecord,
    resource?: string,
  ): Promise<void>;
}
export interface CredentialResolver {
  resolve(reference: string): Promise<string>;
}
export interface AiResource {
  id: string;
  version: string;
  digest: string;
  title: string;
  text: string;
}
export interface ResourceResolver {
  resolve(ownerId: string, reference: string, signal: AbortSignal): Promise<AiResource>;
}
export interface AiTelemetry {
  record(event: {
    execution_id: string;
    name: string;
    duration_ms: number;
    attributes: Record<string, Json>;
  }): void;
}
