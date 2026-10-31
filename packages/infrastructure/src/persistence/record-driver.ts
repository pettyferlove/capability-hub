import type { RecordStore } from '@capability-hub/application/ports';
import type { AiQueries } from '@capability-hub/ai/ports';

export type RecordQueries = Pick<
  RecordStore,
  'get' | 'all' | 'where' | 'insert' | 'put' | 'remove' | 'revision' | 'health'
>;

export interface RecordDriver {
  readonly kind: RecordStore['kind'];
  readonly queries: RecordQueries;
  readonly ai: AiQueries;
  exclusive<T>(work: () => Promise<T>): Promise<T>;
  transaction<T>(work: (queries: RecordQueries, ai: AiQueries) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}
