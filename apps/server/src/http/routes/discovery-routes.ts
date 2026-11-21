import type { Express, Request } from 'express';
import { fail, HubError } from '@capability-hub/domain/errors';
import { requireDiscoveryRequest } from '../../discovery/discovery-service.js';
import type { HttpContext } from '../context.js';
import { jsonRoute as send } from '../response.js';

/**
 * 首页发现的两个精确路由，注册在全站登录与 CSRF 中间件之前：只接受浏览器会话或匿名访问，
 * 拒绝 Bearer 令牌；不开放路由前缀、个人令牌或通用 AI 接口。`/turn` 在请求声明
 * `Accept: text/event-stream` 时推送阶段，再返回已核对的结果，否则一次返回 JSON。
 */
export function registerDiscoveryRoutes(
  app: Express,
  { hub, security, metrics }: HttpContext,
): void {
  const viewer = async (req: Pick<Request, 'headers' | 'signal'>, requireCsrf: boolean) => {
    requireDiscoveryRequest(req.signal);
    if (req.headers.authorization !== undefined)
      fail(403, 'DISCOVERY_SESSION_ONLY', '首页对话只接受浏览器会话或匿名访问');
    const session = await security.session(req);
    requireDiscoveryRequest(req.signal);
    if (requireCsrf && session && req.headers['x-csrf-token'] !== session.csrf)
      fail(403, 'CSRF_REJECTED', '页面会话已变化，请刷新后重试');
    const principal = session ? await hub.identity.principal(session.user_id) : null;
    requireDiscoveryRequest(req.signal);
    return { principal, sessionId: session?.id };
  };
  app.get(
    '/api/catalog/discovery',
    send(async (req) => await hub.discovery.entry(() => viewer(req, false))),
  );
  app.post(
    '/api/catalog/discovery/turn',
    send(async (req, res) => {
      security.origin(req);
      if (!req.is('application/json')) fail(415, 'UNSUPPORTED_MEDIA_TYPE', '请求必须是 JSON');
      const scope = {
        readViewer: () => viewer(req, true),
        clientAddress: req.ip ?? 'unknown',
        signal: req.signal,
        requestId: String(res.locals.request_id),
      };
      if (req.accepts(['application/json', 'text/event-stream']) !== 'text/event-stream')
        return await hub.discovery.turn(req.body, scope);
      // 首个进度帧才发出响应头；在此之前的失败仍走统一错误处理，按状态码返回。
      let open = false;
      const write = (event: string, data: unknown) => {
        if (req.signal.aborted || res.destroyed || res.writableEnded) return;
        if (!open) {
          open = true;
          res.status(200).set({
            'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'private, no-store, no-transform',
            'X-Accel-Buffering': 'no',
          });
          res.flushHeaders();
        }
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      };
      try {
        const result = await hub.discovery.turn(req.body, {
          ...scope,
          progress: (stage) => write('stage', stage),
        });
        if (!open) return result;
        write('result', result);
      } catch (error) {
        if (!open) throw error;
        const failure =
          error instanceof HubError
            ? error
            : new HubError(500, 'INTERNAL_ERROR', '服务暂时无法完成请求');
        metrics.error(failure.code);
        if (!(error instanceof HubError))
          hub.logs.logger.error({
            event: 'http.error',
            code: failure.code,
            request_id: res.locals.request_id,
          });
        write('error', {
          status: failure.status,
          error: {
            code: failure.code,
            message: failure.message,
            request_id: String(res.locals.request_id),
            retryable: failure.retryable,
            details: {},
          },
        });
      }
      res.end();
    }),
  );
}
