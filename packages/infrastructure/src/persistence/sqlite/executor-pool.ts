import { SerialExecutor } from '../transaction/serial-executor.js';

const sqliteExecutors = new Map<string, { executor: SerialExecutor; references: number }>();
export function acquireSqliteExecutor(key: string) {
  const entry = sqliteExecutors.get(key) ?? { executor: new SerialExecutor(), references: 0 };
  entry.references++;
  sqliteExecutors.set(key, entry);
  return {
    executor: entry.executor,
    release() {
      if (--entry.references === 0) sqliteExecutors.delete(key);
    },
  };
}
