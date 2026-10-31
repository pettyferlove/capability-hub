import { useEffect, useState } from 'react';
import {
  aiExecutionViewResponseSchema,
  aiEventResponseSchema,
  aiUsageSchema,
  aiActivityEventTypeSchema,
  aiStreamErrorResponseSchema,
  type AiExecutionViewResponse,
  type AiEventResponse,
} from '@capability-hub/contracts';
import { api, ApiError, streamEvents } from '../../shared/api/client.js';

class StreamGap extends Error {}

const states: Record<string, AiExecutionViewResponse['execution']['status']> = {
  'execution.queued': 'queued',
  'execution.started': 'running',
  'execution.waiting_input': 'waiting_input',
  'execution.completed': 'succeeded',
  'execution.failed': 'failed',
  'execution.cancelled': 'cancelled',
  'execution.timed_out': 'timed_out',
  'execution.retry_scheduled': 'queued',
};
export function applyAiEvent(
  view: AiExecutionViewResponse,
  event: AiEventResponse,
): AiExecutionViewResponse {
  if (event.execution_id !== view.execution.id) throw new StreamGap('事件不属于当前执行');
  if (event.seq <= view.watermark) return view;
  if (event.seq !== view.watermark + 1) throw new StreamGap('事件序号中断');
  const execution = {
    ...view.execution,
    last_seq: event.seq,
    attempt: event.attempt,
    continuation: event.continuation,
    status: states[event.type] ?? view.execution.status,
    message_blocks: view.execution.message_blocks.map((block) => ({ ...block })),
  };
  if (event.type === 'message.started') {
    if (typeof event.data.block_id !== 'string' || typeof event.data.message_id !== 'string')
      throw new StreamGap('消息标识无效');
    execution.message_blocks.push({
      id: event.data.block_id,
      message_id: event.data.message_id,
      text: '',
      complete: false,
    });
  }
  const block = execution.message_blocks.find((item) => item.id === event.data.block_id);
  if (event.type === 'message.delta') {
    if (!block || block.text.length !== event.data.offset || typeof event.data.delta !== 'string')
      throw new StreamGap('文本偏移中断');
    block.text += event.data.delta;
    execution.message_text += event.data.delta;
  }
  if (event.type === 'message.completed' && block) block.complete = true;
  if (event.type === 'usage.updated') execution.usage = aiUsageSchema.parse(event.data);
  if (event.type === 'execution.completed') execution.result = event.data.result ?? null;
  const activity = aiActivityEventTypeSchema.safeParse(event.type).success
    ? [...view.activity, event]
    : view.activity;
  return {
    ...view,
    execution,
    activity: activity.slice(-1000),
    activity_truncated: view.activity_truncated || activity.length > 1000,
    watermark: event.seq,
  };
}
export function useAiExecution(id: string, refresh: number) {
  const [view, setView] = useState<AiExecutionViewResponse>();
  const [connection, setConnection] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    setView((prior) => (prior?.execution.id === id ? prior : undefined));
    setError('');
    if (!id) {
      setConnection('');
      return;
    }
    const controller = new AbortController();
    let current: AiExecutionViewResponse | undefined;
    let cursor: string | undefined;
    let retries = 0;
    const publish = (next: AiExecutionViewResponse) => {
      current = next;
      setView(next);
    };
    const run = async () => {
      while (!controller.signal.aborted) {
        try {
          setConnection(retries ? '正在重连' : '正在连接');
          await streamEvents(
            `/api/ai/executions/${encodeURIComponent(id)}/events`,
            (event) => {
              const previousWatermark = current?.watermark ?? -1;
              if (event.event === 'stream.snapshot' || event.event === 'stream.reset') {
                if (!event.data || typeof event.data !== 'object')
                  throw new StreamGap('无效的执行快照');
                const { schema_version: version, ...data } = event.data as Record<string, unknown>;
                if (version !== 1) throw new StreamGap('事件协议版本不支持');
                const snapshot = aiExecutionViewResponseSchema.parse(data);
                if (snapshot.execution.id !== id) throw new StreamGap('快照不属于当前执行');
                publish(snapshot);
              } else if (event.event === 'stream.error') {
                const failure = aiStreamErrorResponseSchema.parse(event.data);
                if (failure.code === 'ACCESS_REVOKED')
                  throw new ApiError(403, failure.code, '访问权限已变化，请重新确认');
                throw new ApiError(503, failure.code, '事件连接暂不可用');
              } else {
                const data = aiEventResponseSchema.parse(event.data);
                if (event.event !== data.type) throw new StreamGap('事件类型不匹配');
                if (!current) throw new StreamGap('缺少执行快照');
                publish(applyAiEvent(current, data));
              }
              if (event.id) cursor = event.id;
              setConnection('实时连接');
              if (current && current.watermark > previousWatermark) retries = 0;
            },
            controller.signal,
            cursor,
          );
          if (controller.signal.aborted) return;
          const latest = aiExecutionViewResponseSchema.parse(
            await api(`/api/ai/executions/${encodeURIComponent(id)}`, {
              signal: controller.signal,
            }),
          );
          publish(latest);
          cursor = `${id}:operator:${latest.watermark}`;
          if (!['queued', 'running'].includes(latest.execution.status)) {
            setConnection(
              latest.execution.status === 'waiting_input' ? '等待你的回答' : '执行已结束',
            );
            return;
          }
        } catch (failure) {
          if (controller.signal.aborted) return;
          if (failure instanceof ApiError && [401, 403, 404].includes(failure.status)) {
            setView(undefined);
            setError(failure.message);
            setConnection('连接已关闭');
            return;
          }
          if (
            failure instanceof StreamGap ||
            (failure instanceof Error && failure.name === 'ZodError')
          )
            cursor = undefined;
          retries++;
          setConnection('连接中断，正在重试');
          if (retries >= 5) {
            setError('事件连接暂不可用，请重新打开此执行。');
            return;
          }
        }
        await new Promise<void>((resolve) => {
          const timer = window.setTimeout(done, Math.min(1000 * 2 ** retries, 15000));
          function done() {
            window.clearTimeout(timer);
            controller.signal.removeEventListener('abort', done);
            resolve();
          }
          controller.signal.addEventListener('abort', done, { once: true });
        });
      }
    };
    void run();
    return () => controller.abort();
  }, [id, refresh]);
  return { view, connection, error };
}
