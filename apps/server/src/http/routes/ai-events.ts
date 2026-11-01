import { setTimeout as delay } from 'node:timers/promises';
import { z } from 'zod';
import { aiEventResponseSchema, aiStreamErrorResponseSchema } from '@capability-hub/contracts';
import { AiError, terminalStatuses } from '@capability-hub/ai';
import { fail, HubError } from '@capability-hub/domain/errors';
import type { Request, Response } from 'express';
import type { HttpContext } from '../context.js';
import { executionView } from './ai-views.js';

const connections = new WeakMap<HttpContext['hub'], Map<string, number>>();
/**
 * 执行事件 SSE。同一 principal 最多同时打开 4 条连接，超出 429 `AI_STREAM_LIMIT`；
 * 单条连接最多存活 300 秒后由客户端按 `retry: 1500` 重连，重连时用 `Last-Event-ID`
 * （或 `?cursor=`）续传，游标必须是 `<execution_id>:operator:<n>` 形式，
 * 否则 400 `AI_CURSOR_INVALID`。
 * 每轮读取前重新校验会话与可见性：会话失效、权限被收回或执行不可见时，先发 `stream.error`
 * （`ACCESS_REVOKED`）再结束，而不是继续推送旧内容；事件位置不连续时先发 `stream.reset` 快照，
 * 保证客户端不会拼接出带缺口的视图。每 15 秒发一次注释心跳，期间无新事件时每 250ms 轮询一次。
 */
export async function streamAiEvents(
  req: Request<Record<string, string | string[]>, unknown, unknown, Record<string, unknown>>,
  res: Response,
  { hub, security }: HttpContext,
) {
  const id = String(req.params.id);
  const runtime = hub.ai.runtime;
  const query = z
    .object({ cursor: z.string().max(500).optional() })
    .strict()
    .parse(req.query);
  const initial = await runtime.store.tx(async () => {
    const view = await runtime.view(id);
    const principal = await hub.ai.principal(res.locals.principal, view.execution, true);
    return { view, principal };
  });
  const { principal } = initial;
  const view = initial.view;
  let cursor = 0;
  let fresh = true;
  const raw = req.get('Last-Event-ID') ?? query.cursor;
  if (raw) {
    const prefix = `${id}:operator:`;
    if (!raw.startsWith(prefix) || !/^\d+$/.test(raw.slice(prefix.length)))
      fail(400, 'AI_CURSOR_INVALID', '事件游标不属于当前执行');
    cursor = Number(raw.slice(prefix.length));
    if (!Number.isSafeInteger(cursor)) fail(400, 'AI_CURSOR_INVALID', '事件游标无效');
    fresh = false;
  }
  let counts = connections.get(hub);
  if (!counts) {
    counts = new Map();
    connections.set(hub, counts);
  }
  if ((counts.get(principal.id) ?? 0) >= 4)
    throw new HubError(429, 'AI_STREAM_LIMIT', '同时打开的 AI 事件连接过多', {}, true);
  counts.set(principal.id, (counts.get(principal.id) ?? 0) + 1);
  const controller = new AbortController();
  const close = () => controller.abort();
  res.once('close', close);
  const started = Date.now();
  let heartbeat = started;
  const send = (event: string, data: unknown, seq?: number) =>
    res.write(
      `${seq === undefined ? '' : `id: ${id}:operator:${seq}\n`}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`,
    );
  res.set({
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'private, no-store, no-transform',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();
  try {
    res.write('retry: 1500\n\n');
    if (fresh || cursor > view.watermark) {
      cursor = view.watermark;
      if (
        !send(
          fresh ? 'stream.snapshot' : 'stream.reset',
          { schema_version: 1, ...executionView(view) },
          cursor,
        )
      )
        return;
    }
    while (!controller.signal.aborted && Date.now() - started < 300000) {
      // 授权、资源证据和输出属于同一事务，不能在检查后读到新提交的派生内容。
      const { events, row, reset } = await runtime.store.tx(async () => {
        const session = await security.session(req);
        if (!session) fail(401, 'UNAUTHENTICATED', '请重新登录');
        const current = await hub.identity.principal(session.user_id);
        const row = await runtime.get(id);
        await hub.ai.principal(current, row, true);
        const events = await runtime.store.list('ai_events', {
          execution_id: id,
          lookup_key: `${id}:operator`,
          after: { position: cursor, id: '\uffff' },
          limit: 100,
        });
        const gap = events.some((event, index) => event.position !== cursor + index + 1);
        return { events, row, reset: gap ? await runtime.view(id) : undefined };
      });
      if (reset) {
        cursor = reset.watermark;
        if (!send('stream.reset', { schema_version: 1, ...executionView(reset) }, cursor)) return;
      }
      for (const event of reset ? [] : events) {
        if (
          !send(
            event.payload.type,
            aiEventResponseSchema.parse({ ...event.payload, execution_id: id }),
            event.position,
          )
        )
          return;
        cursor = event.position;
      }
      if (
        (terminalStatuses.has(row.status) || row.status === 'waiting_input') &&
        cursor >= row.payload.last_seq
      )
        return;
      if (Date.now() - heartbeat >= 15000) {
        if (!res.write(': heartbeat\n\n')) return;
        heartbeat = Date.now();
      }
      if (events.length < 100) await delay(250, undefined, { signal: controller.signal });
    }
  } catch (error) {
    if (!controller.signal.aborted) {
      const denied =
        (error instanceof HubError && [401, 403, 404].includes(error.status)) ||
        (error instanceof AiError && ['AI_FORBIDDEN', 'AI_NOT_FOUND'].includes(error.code));
      send(
        'stream.error',
        aiStreamErrorResponseSchema.parse({
          schema_version: 1,
          code: denied ? 'ACCESS_REVOKED' : 'STREAM_UNAVAILABLE',
        }),
      );
    }
  } finally {
    res.off('close', close);
    const remaining = (counts.get(principal.id) ?? 1) - 1;
    if (remaining > 0) counts.set(principal.id, remaining);
    else counts.delete(principal.id);
    res.end();
  }
}
