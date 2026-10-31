import type { RecordStore } from '@capability-hub/application/ports';

export type RecordQueries = Pick<
  RecordStore,
  'get' | 'all' | 'where' | 'insert' | 'put' | 'remove' | 'revision' | 'health'
>;

export interface RecordDriver {
  readonly kind: RecordStore['kind'];
  readonly queries: RecordQueries;
  exclusive<T>(work: () => Promise<T>): Promise<T>;
  transaction<T>(work: (queries: RecordQueries) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}
