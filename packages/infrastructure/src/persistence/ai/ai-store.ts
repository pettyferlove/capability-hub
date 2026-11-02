import type { AiStore, AiRecordQuery } from '@capability-hub/ai/ports';
import type { AiTable, AiRecordMap } from '@capability-hub/ai/records';
import type { RecordStore } from '@capability-hub/application/ports';
import type { PersistenceSession } from '../transaction/persistence-session.js';

const sessions = new WeakMap<RecordStore, PersistenceSession>();

/**
 * 把 AI 端口绑定到具体的持久化会话。`createAiStore` 只认这里登记过的 store，
 * 因此 AI 写入必然与业务写入落在同一事务执行器上，不会出现两套连接。
 * 以 `WeakMap` 保存，store 被回收时绑定随之消失，不阻止 GC。
 */
export function bindPersistenceSession(store: RecordStore, session: PersistenceSession): void {
  sessions.set(store, session);
}

/**
 * `AiStore` 端口的实现入口。未绑定的 store 直接抛错，而不是退化为独立连接或内存表。
 *
 * 关键不变量：`insert`/`put`/`remove` 各自开启一个事务（`store.tx`），并由适配器在事务内
 * 校验归属——子表记录的 `owner_id` 必须与所属 `ai_executions` 一致，`ai_events`/`ai_artifacts`/
 * `ai_effects` 一旦写入不可修改。任何违反都以普通 `Error` 抛出，使所在事务整体回滚。
 */
export function createAiStore(store: RecordStore): AiStore {
  const session = sessions.get(store);
  if (!session) throw new Error('AI 存储需要同一基础设施 PersistenceSession');
  return new AiStoreAdapter(session);
}

class AiStoreAdapter implements AiStore {
  constructor(private readonly session: PersistenceSession) {}
  tx<T>(work: () => T | Promise<T>): Promise<T> {
    return this.session.tx(work);
  }
  get<K extends AiTable>(table: K, id: string) {
    return this.session.execute((q) => q.ai.get(table, id));
  }
  list<K extends AiTable>(table: K, query: AiRecordQuery) {
    return this.session.execute((q) => q.ai.list(table, query));
  }
  summarizeExecutions() {
    return this.session.execute((q) => q.ai.summarizeExecutions());
  }
  summarizeExecutionDays(from: string, through: string) {
    return this.session.execute((q) => q.ai.summarizeExecutionDays(from, through));
  }
  summarizeTokenUsage(from: string | null, through: string, granularity: 'day' | 'month') {
    return this.session.execute((q) => q.ai.summarizeTokenUsage(from, through, granularity));
  }
  private async owner<K extends AiTable>(table: K, record: AiRecordMap[K]) {
    if (table === 'ai_executions') {
      if (record.execution_id !== record.id) throw new Error('执行 ID 不一致');
      return;
    }
    const execution = await this.get('ai_executions', record.execution_id);
    if (!execution || execution.owner_id !== record.owner_id) throw new Error('AI 记录归属不一致');
  }
  insert<K extends AiTable>(table: K, record: AiRecordMap[K]) {
    return this.tx(async () => {
      await this.owner(table, record);
      return this.session.execute((q) => q.ai.insert(table, record));
    });
  }
  put<K extends AiTable>(table: K, record: AiRecordMap[K]) {
    return this.tx(async () => {
      if (['ai_events', 'ai_artifacts', 'ai_effects'].includes(table))
        throw new Error('已提交的 AI 记录不可修改');
      const prior = await this.get(table, record.id);
      if (
        !prior ||
        prior.owner_id !== record.owner_id ||
        prior.execution_id !== record.execution_id ||
        prior.created_at !== record.created_at
      )
        throw new Error('AI 记录归属不可修改');
      return this.session.execute((q) => q.ai.put(table, record));
    });
  }
  remove(table: AiTable, id: string) {
    return this.tx(() => this.session.execute((q) => q.ai.remove(table, id)));
  }
}
