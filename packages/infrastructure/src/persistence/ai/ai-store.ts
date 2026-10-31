import type { AiStore, AiRecordQuery } from '@capability-hub/ai/ports';
import type { AiTable, AiRecordMap } from '@capability-hub/ai/records';
import type { RecordStore } from '@capability-hub/application/ports';
import type { PersistenceSession } from '../transaction/persistence-session.js';

const sessions = new WeakMap<RecordStore, PersistenceSession>();
export function bindPersistenceSession(store: RecordStore, session: PersistenceSession): void {
  sessions.set(store, session);
}
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
