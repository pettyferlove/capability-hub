import { fail, HubError } from '@capability-hub/domain/errors';
import { setTimeout as delay } from 'node:timers/promises';
import type { Request, Response } from 'express';
import type { HttpContext } from '../context.js';

/** 从已提交记录发送完整进度，短阶段不会因采样或重连而丢失。 */
export async function streamIntakeProgress(
  req: Request<Record<string, string | string[]>, unknown, unknown, Record<string, unknown>>,
  res: Response,
  { hub, security }: HttpContext,
): Promise<void> {
  const id = String(req.params.id);
  let progress = await hub.intakeQueries.getProgress(res.locals.principal, id);
  const controller = new AbortController();
  const close = () => controller.abort();
  res.once('close', close);
  res.set({
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'private, no-store, no-transform',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();
  let previous = '';
  let heartbeat = Date.now();
  try {
    res.write('retry: 2000\n\n');
    while (!controller.signal.aborted) {
      const serialized = JSON.stringify(progress);
      if (serialized !== previous) {
        // 慢客户端终止后重新读取完整状态，避免无界积累响应缓冲。
        if (!res.write(`event: progress\ndata: ${serialized}\n\n`)) break;
        previous = serialized;
      } else if (Date.now() - heartbeat >= 15000) {
        if (!res.write(': heartbeat\n\n')) break;
        heartbeat = Date.now();
      }
      if (['ready', 'failed', 'cancelled'].includes(progress.state)) break;
      await delay(750, undefined, { signal: controller.signal });
      // 长连接每次读取前复核会话、账号和当前记录权限。
      const session = await security.session(req);
      if (!session) fail(401, 'UNAUTHENTICATED', '请重新登录');
      const principal = await hub.identity.principal(session.user_id);
      progress = await hub.intakeQueries.getProgress(principal, id);
    }
  } catch (error) {
    if (!controller.signal.aborted) {
      const denied = error instanceof HubError && [401, 403, 404].includes(error.status);
      res.write(
        `event: stream-error\ndata: ${JSON.stringify({ code: denied ? 'ACCESS_REVOKED' : 'STREAM_UNAVAILABLE' })}\n\n`,
      );
      if (!denied)
        hub.logs.logger.error({ event: 'intake.stream_failed', intake_id: id, err: error });
    }
  } finally {
    res.off('close', close);
    res.end();
  }
}
