import { SerialExecutor } from '../transaction/serial-executor.js';

const sqliteExecutors = new Map<string, { executor: SerialExecutor; references: number }>();
/**
 * 按规范路径取（或创建）该库唯一的串行执行器，带引用计数。
 *
 * 同一路径的所有驱动实例共享一个 {@link SerialExecutor}，这是 SQLite 单写者模型在进程内的强制点：
 * 并发请求不会真的并行写库。计数归零时才移出 Map，因此调用方必须成对调用 `release()`；
 * 返回的 `executor` 在释放后仍可安全使用（不会再被其它实例复用）。
 */
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
