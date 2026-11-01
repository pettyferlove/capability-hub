import { MemoryStorage } from '@mastra/core/storage';
import type { MastraDBMessage, StorageThreadType } from '@mastra/core/memory';
import type { AiRecordMap } from '../core/records.js';
import { AiError } from '../core/errors.js';
import { type ExecutionScope } from '../execution/scope.js';
import { encodeNative } from './codec.js';

type Arg<K extends keyof MemoryStorage> = MemoryStorage[K] extends (...args: infer A) => unknown
  ? A[0]
  : never;
type MemoryTable = 'ai_threads' | 'ai_messages';
function threadValue(row: AiRecordMap['ai_threads']): StorageThreadType {
  const value = row.payload.value as unknown as StorageThreadType;
  return { ...value, createdAt: new Date(value.createdAt), updatedAt: new Date(value.updatedAt) };
}

function messageValue(row: AiRecordMap['ai_messages']): MastraDBMessage {
  const value = row.payload.value as unknown as MastraDBMessage;
  return { ...value, createdAt: new Date(value.createdAt) };
}

function matchesMetadata(value: unknown, filter?: Record<string, unknown>): boolean {
  if (!filter) return true;
  return (
    !!value &&
    typeof value === 'object' &&
    Object.entries(filter).every(
      ([key, item]) =>
        Object.hasOwn(value, key) && (value as Record<string, unknown>)[key] === item,
    )
  );
}

function pageRows<T>(rows: T[], page = 0, perPage: number | false = 100) {
  if (
    !Number.isInteger(page) ||
    page < 0 ||
    (perPage !== false && (!Number.isInteger(perPage) || perPage < 1 || perPage > 1000))
  )
    throw new AiError('AI_CONFIGURATION', '无效的记忆分页参数');
  return {
    rows: perPage === false ? rows : rows.slice(page * perPage, (page + 1) * perPage),
    total: rows.length,
    page,
    perPage,
    hasMore: perPage !== false && (page + 1) * perPage < rows.length,
  };
}

// 会话记忆限制在单次 execution；跨运行知识通过带版本、权限检查的 ResourceResolver 获取。

/**
 * 只读写当前执行会话记忆的 Mastra 存储：跨执行或跨账号访问抛 `AI_FORBIDDEN`，
 * 单个执行条目上限 10000（超出 `AI_BUDGET_EXCEEDED`），分页参数非法抛 `AI_CONFIGURATION`；
 * `dangerouslyClearAll` 一律拒绝，清理由执行生命周期负责。
 */
export class ScopedMemoryStorage extends MemoryStorage {
  readonly supportsPartialThreadUpdate = true;
  constructor(private readonly scope: ExecutionScope) {
    super();
  }
  dangerouslyClearAll(): Promise<void> {
    return Promise.reject(new AiError('AI_FORBIDDEN', '禁止清空记忆存储'));
  }
  private async row(table: MemoryTable, id: string) {
    const row = await this.scope.store.get(table, id);
    const current = this.scope.current();
    if (
      row &&
      (row.execution_id !== current.lease.execution_id || row.owner_id !== current.owner_id)
    )
      throw new AiError('AI_FORBIDDEN', '记忆不属于当前执行');
    return row;
  }
  private async rows(table: MemoryTable) {
    const current = this.scope.current();
    const result: AiRecordMap[MemoryTable][] = [];
    let after: { position: number; id: string } | undefined;
    for (;;) {
      const page = await this.scope.store.list(table, {
        execution_id: current.lease.execution_id,
        owner_id: current.owner_id,
        limit: 1000,
        after,
      });
      result.push(...page);
      if (page.length < 1000) return result;
      if (result.length >= 10000) throw new AiError('AI_BUDGET_EXCEEDED', '记忆条目超过执行上限');
      const last = page[page.length - 1];
      after = { id: last.id, position: last.position };
    }
  }
  private async save(table: MemoryTable, id: string, value: unknown, key: string, createdAt: Date) {
    const prior = await this.row(table, id);
    const current = this.scope.current();
    const now = new Date().toISOString();
    const row: AiRecordMap[MemoryTable] = {
      id,
      owner_id: current.owner_id,
      execution_id: current.lease.execution_id,
      lookup_key: key,
      status: 'active',
      position: createdAt.getTime(),
      created_at: prior?.created_at ?? now,
      updated_at: now,
      payload: { value: encodeNative(value) },
    };
    if (prior) await this.scope.store.put(table, row);
    else await this.scope.store.insert(table, row);
  }
  async getThreadById({ threadId, resourceId }: Arg<'getThreadById'>) {
    const row = await this.row('ai_threads', threadId);
    const thread = row ? threadValue(row) : null;
    return thread && (!resourceId || thread.resourceId === resourceId) ? thread : null;
  }
  async saveThread({ thread }: Arg<'saveThread'>) {
    return this.scope.write(async () => {
      if (thread.resourceId !== this.scope.current().owner_id)
        throw new AiError('AI_FORBIDDEN', '会话归属不匹配');
      await this.save('ai_threads', thread.id, thread, thread.resourceId, thread.createdAt);
      return thread;
    });
  }
  async updateThread({ id, title, metadata }: Arg<'updateThread'>) {
    return this.scope.write(async () => {
      const old = await this.getThreadById({ threadId: id });
      if (!old) throw new AiError('AI_NOT_FOUND', '会话不存在');
      const next = {
        ...old,
        ...(title === undefined ? {} : { title }),
        ...(metadata === undefined ? {} : { metadata }),
        updatedAt: new Date(),
      };
      await this.save('ai_threads', id, next, next.resourceId, next.createdAt);
      return next;
    });
  }
  async deleteThread({ threadId }: Arg<'deleteThread'>) {
    await this.scope.write(async () => {
      if (!(await this.row('ai_threads', threadId))) return;
      for (const row of await this.rows('ai_messages'))
        if (row.lookup_key === threadId) await this.scope.store.remove('ai_messages', row.id);
      await this.scope.store.remove('ai_threads', threadId);
    });
  }
  async listMessages(args: Arg<'listMessages'>) {
    const ids = typeof args.threadId === 'string' ? [args.threadId] : args.threadId;
    for (const id of ids) await this.row('ai_threads', id);
    const all = (await this.rows('ai_messages'))
      .filter((row) => ids.includes(row.lookup_key))
      .map(messageValue)
      .filter((m) => !args.resourceId || m.resourceId === args.resourceId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id));
    const range = args.filter?.dateRange;
    const matches = all.filter(
      (m) =>
        (!range?.start ||
          (range.startExclusive ? m.createdAt > range.start : m.createdAt >= range.start)) &&
        (!range?.end ||
          (range.endExclusive ? m.createdAt < range.end : m.createdAt <= range.end)) &&
        matchesMetadata(m.content.metadata, args.filter?.metadata),
    );
    if ((args.orderBy?.direction ?? 'DESC') === 'DESC') matches.reverse();
    const { rows, ...pagination } = pageRows(matches, args.page, args.perPage ?? 40);
    const included = new Set(rows.map((m) => m.id));
    for (const include of args.include ?? []) {
      const index = all.findIndex(
        (m) => m.id === include.id && (!include.threadId || m.threadId === include.threadId),
      );
      if (index < 0) continue;
      for (const m of all.slice(
        Math.max(0, index - (include.withPreviousMessages ?? 0)),
        index + (include.withNextMessages ?? 0) + 1,
      ))
        included.add(m.id);
    }
    // Mastra 的历史上下文按时间正序返回，分页选择仍按请求排序。
    return { messages: all.filter((m) => included.has(m.id)), ...pagination };
  }
  async listMessagesById({ messageIds }: Arg<'listMessagesById'>) {
    const messages: MastraDBMessage[] = [];
    for (const id of messageIds) {
      const row = await this.row('ai_messages', id);
      if (row) messages.push(messageValue(row));
    }
    return { messages };
  }
  async saveMessages({ messages }: Arg<'saveMessages'>) {
    return this.scope.write(async () => {
      for (const message of messages) {
        if (
          !message.threadId ||
          !(await this.row('ai_threads', message.threadId)) ||
          message.resourceId !== this.scope.current().owner_id
        )
          throw new AiError('AI_FORBIDDEN', '消息归属不匹配');
        await this.save('ai_messages', message.id, message, message.threadId, message.createdAt);
      }
      return { messages };
    });
  }
  async updateMessages({ messages }: Arg<'updateMessages'>) {
    return this.scope.write(async () => {
      const updated: MastraDBMessage[] = [];
      for (const patch of messages) {
        const row = await this.row('ai_messages', patch.id);
        if (!row) continue;
        const old = messageValue(row);
        const next = { ...old, ...patch, content: { ...old.content, ...patch.content } };
        if (next.threadId !== old.threadId || next.resourceId !== old.resourceId)
          throw new AiError('AI_FORBIDDEN', '不能改变消息归属');
        await this.save('ai_messages', next.id, next, next.threadId!, next.createdAt);
        updated.push(next);
      }
      return updated;
    });
  }
  async deleteMessages(ids: string[]) {
    await this.scope.write(async () => {
      for (const id of ids)
        if (await this.row('ai_messages', id)) await this.scope.store.remove('ai_messages', id);
    });
  }
  async listThreads(args: Arg<'listThreads'>) {
    const rows = (await this.rows('ai_threads'))
      .map(threadValue)
      .filter(
        (t) =>
          (!args.filter?.resourceId || t.resourceId === args.filter.resourceId) &&
          matchesMetadata(t.metadata, args.filter?.metadata),
      );
    const field = args.orderBy?.field ?? 'createdAt';
    const direction = args.orderBy?.direction === 'ASC' ? 1 : -1;
    rows.sort(
      (a, b) => direction * (a[field].getTime() - b[field].getTime() || a.id.localeCompare(b.id)),
    );
    const { rows: threads, ...pagination } = pageRows(rows, args.page, args.perPage);
    return { threads, ...pagination };
  }
}
