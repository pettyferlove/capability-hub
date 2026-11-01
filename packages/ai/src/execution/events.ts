import { randomUUID } from 'node:crypto';
import type { AiEvent, AiEventType, ExecutionRecord, Json } from '../core/records.js';
import type { AiStore } from '../core/ports.js';
import { type ExecutionScope } from './scope.js';
import { AiError } from '../core/errors.js';

function eventText(value: Json | undefined): string {
  if (typeof value !== 'string') throw new AiError('AI_INTERNAL', '文本事件字段无效');
  return value;
}

export class AiEventService {
  constructor(
    readonly store: AiStore,
    readonly scope: ExecutionScope,
    readonly maxBytes: number,
  ) {}
  async append(
    execution: ExecutionRecord,
    type: AiEventType,
    data: Record<string, Json>,
  ): Promise<AiEvent> {
    const block = execution.payload.message_blocks.find((item) => item.id === data.block_id);
    if (type === 'message.started' && block) throw new AiError('AI_INTERNAL', '消息块标识重复');
    if (type === 'message.delta' && (!block || block.complete || block.text.length !== data.offset))
      throw new AiError('AI_INTERNAL', '消息增量偏移不连续');
    if (type === 'message.completed' && (!block || block.text.length !== data.length))
      throw new AiError('AI_INTERNAL', '消息结束长度不一致');
    const seq = execution.payload.last_seq + 1;
    const now = new Date().toISOString();
    const event: AiEvent = {
      id: randomUUID(),
      owner_id: execution.owner_id,
      execution_id: execution.id,
      lookup_key: execution.id + ':operator',
      position: seq,
      status: 'committed',
      created_at: now,
      updated_at: now,
      payload: {
        schema_version: 1,
        audience: 'operator',
        seq,
        type,
        attempt: execution.payload.attempt,
        continuation: execution.payload.continuation,
        occurred_at: now,
        data,
      },
    };
    const bytes = Buffer.byteLength(JSON.stringify(event));
    // 为失败或取消终态保留空间，额度耗尽仍可给 UI 一个完整结论。
    if (
      execution.payload.event_bytes + bytes > this.maxBytes &&
      !['execution.failed', 'execution.cancelled', 'execution.timed_out'].includes(type)
    )
      throw new AiError('AI_BUDGET_EXCEEDED', '执行事件已达到存储上限');
    await this.store.insert('ai_events', event);
    execution.payload.last_seq = seq;
    execution.payload.event_bytes += bytes;
    if (type === 'message.delta') execution.payload.message_text += eventText(data.delta);
    if (type === 'message.started')
      execution.payload.message_blocks.push({
        id: eventText(data.block_id),
        message_id: eventText(data.message_id),
        text: '',
        complete: false,
      });
    if (type === 'message.delta' && block) {
      block.text += eventText(data.delta);
    }
    if (type === 'message.completed' && block) block.complete = true;
    execution.updated_at = now;
    await this.store.put('ai_executions', execution);
    return event;
  }
  async emit(type: AiEventType, data: Record<string, Json>): Promise<void> {
    await this.scope.write(async (execution) => {
      await this.append(execution, type, data);
    });
  }
}

export class AgentEventMapper {
  private readonly blocks = new Map<string, string>();
  private blockSequence = 0;
  private readonly offsets = new Map<string, number>();
  private pending: { id: string; text: string } | undefined;
  private lastFlush = Date.now();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private serial = Promise.resolve();
  constructor(
    private readonly events: AiEventService,
    private readonly prefix: string,
  ) {}
  async accept(raw: unknown): Promise<void> {
    const operation = this.serial.then(() => this.map(raw));
    this.serial = operation;
    return operation;
  }
  private async map(raw: unknown): Promise<void> {
    if (!raw || typeof raw !== 'object' || !('type' in raw) || typeof raw.type !== 'string') return;
    const payload =
      'payload' in raw && raw.payload && typeof raw.payload === 'object' ? raw.payload : {};
    const item = payload as Record<string, unknown>;
    const sourceId = typeof item.id === 'string' ? item.id : 'text';
    if (raw.type === 'text-delta' && typeof item.text === 'string') {
      const id = this.blockId(sourceId);
      if (this.pending && this.pending.id !== id) await this.flushPending();
      this.pending ??= { id, text: '' };
      this.pending.text += item.text;
      if (Buffer.byteLength(this.pending.text) >= 4096 || Date.now() - this.lastFlush >= 50)
        await this.flushPending();
      else if (!this.timer)
        this.timer = setTimeout(() => {
          this.timer = undefined;
          this.serial = this.serial.then(() => this.flushPending());
          void this.serial.catch((error) => this.events.scope.current().controller.abort(error));
        }, 50);
      return;
    }
    await this.flushPending();
    if (raw.type === 'text-start') {
      if (this.blocks.has(sourceId)) throw new AiError('AI_INTERNAL', '消息块尚未结束');
      // 模型的块 ID 仅在单轮响应内唯一；工具续轮可能再次从 0 开始。
      const id = `${this.prefix}:${++this.blockSequence}`;
      this.blocks.set(sourceId, id);
      this.offsets.set(id, 0);
      await this.events.emit('message.started', {
        message_id: this.prefix,
        block_id: id,
        format: 'text',
      });
    } else if (raw.type === 'text-end') {
      const id = this.blockId(sourceId);
      await this.events.emit('message.completed', {
        message_id: this.prefix,
        block_id: id,
        length: this.offsets.get(id) ?? 0,
      });
      this.blocks.delete(sourceId);
      this.offsets.delete(id);
    }
  }
  private blockId(sourceId: string): string {
    const id = this.blocks.get(sourceId);
    if (!id) throw new AiError('AI_INTERNAL', '消息块尚未开始');
    return id;
  }
  async flush(): Promise<void> {
    this.serial = this.serial.then(() => this.flushPending());
    await this.serial;
  }
  async close(): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    await this.serial.catch(() => undefined);
  }
  private async flushPending(): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    if (!this.pending) return;
    const { id, text } = this.pending;
    this.pending = undefined;
    const offset = this.offsets.get(id) ?? 0;
    await this.events.emit('message.delta', {
      message_id: this.prefix,
      block_id: id,
      offset,
      delta: text,
    });
    this.offsets.set(id, offset + text.length);
    this.lastFlush = Date.now();
  }
}
