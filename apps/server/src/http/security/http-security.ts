import { hubFeedbackRefSchema } from '@capability-hub/contracts';
import type { Principal } from '@capability-hub/domain/identity';
import { tokenRecordSchema } from '@capability-hub/domain/token';
import { fail, HubError } from '@capability-hub/domain/errors';
import type { CookieOptions, NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { readSessionClient } from './session-client.js';
import type { HubServices } from '../../bootstrap/hub-services.js';

// 按已匹配的路由模板放行，不把资产下新增的管理读取自动归入消费权限。
const catalogReadRoutes: Record<string, true> = {
  '/api/catalog/keywords': true,
  '/api/scenarios': true,
  '/api/assets': true,
  '/api/assets/:id': true,
  '/api/assets/:id/versions': true,
  '/api/assets/:id/versions/:versionId': true,
  '/api/versions/:id/manifest': true,
  '/api/versions/:id/files': true,
  '/api/versions/:id/archive': true,
  '/api/versions/:id/mcp-config': true,
};

const feedbackPath =
  /^\/api\/hub-feedback\/([\da-fA-F-]{1,36})(?:\/(comments|close|read)|\/attachments\/([\da-fA-F-]{36}))?$/;
const feedbackUuid = z.regexes.uuid();

function personalFeedbackRequest(method: string, path: string): boolean {
  if (method !== 'GET' && method !== 'POST') return false;
  if (path === '/api/hub-feedback') return true;
  if (path === '/api/hub-feedback/summary') return method === 'GET';
  const match = feedbackPath.exec(path);
  if (!match) return false;
  const [, ref, action, attachment] = match;
  if (method === 'POST') return action !== undefined && feedbackUuid.test(ref);
  if (attachment !== undefined) return feedbackUuid.test(ref) && feedbackUuid.test(attachment);
  return action === undefined && hubFeedbackRefSchema.safeParse(ref).success;
}

/** 浏览器会话、Bearer 作用域和 CSRF 的 HTTP 边界。 */
export class HttpSecurity {
  private readonly sessionCookie: CookieOptions;
  constructor(private readonly hub: HubServices) {
    this.sessionCookie = {
      httpOnly: true,
      secure: new URL(hub.config.publicUrl).protocol === 'https:',
      sameSite: 'strict',
      path: '/',
    };
  }
  private get config() {
    return this.hub.config;
  }
  async session(req: Pick<Request, 'headers'>) {
    const raw = (req.headers.cookie ?? '')
      .split(';')
      .map((s) => s.trim())
      .find((s) => s.startsWith('hub_session='))
      ?.slice(12);
    if (!raw) return;
    return await this.hub.sessions.find(raw);
  }
  /** 目录允许匿名访问；显式 Bearer 必须验证，过期的浏览器会话按匿名处理。 */
  optionalAuthenticate = async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (req.headers.authorization !== undefined || (await this.session(req))) {
        await this.authenticate(req, res, (error?: unknown) => {
          if (!error) res.locals.viewer = res.locals.principal;
          next(error);
        });
      } else {
        res.locals.viewer = null;
        next();
      }
    } catch (error) {
      next(error);
    }
  };
  authenticate = async (req: Request, res: Response, next: NextFunction) => {
    try {
      let p: Principal;
      if (req.originalUrl.split('?')[0] === '/mcp' && !req.headers.authorization)
        fail(401, 'BEARER_REQUIRED', '请在客户端发起 Hub 连接授权');
      const bearer = req.headers.authorization?.match(/^Bearer (\S+)$/)?.[1];
      if (req.headers.authorization !== undefined && !bearer)
        fail(401, 'UNAUTHENTICATED', '访问令牌格式无效');
      if (bearer) {
        const path = req.originalUrl.split('?')[0];
        const connection = await this.hub.oauth.authenticate(bearer);
        const parsed = tokenRecordSchema.safeParse(
          connection ? null : await this.hub.tokens.find(bearer),
        );
        const r =
          connection ?? (parsed.success && parsed.data.revoked_at === null ? parsed.data : null);
        if (!r) fail(401, 'UNAUTHENTICATED', '连接已失效，请重新授权');
        if (connection && path !== '/mcp') fail(403, 'TOKEN_SCOPE', '此授权仅用于 Hub MCP');
        p = await this.hub.identity.principal(r.user_id);
        const route = req.route as { path?: string } | undefined;
        const consumerRead =
          (req.method === 'GET' || req.method === 'HEAD') &&
          (Object.hasOwn(catalogReadRoutes, route?.path ?? '') ||
            path === '/api/me' ||
            /^\/api\/versions\/[\da-fA-F-]{36}\/mcp-options$/.test(path));
        if (
          !(path === '/mcp' && ['GET', 'POST', 'DELETE'].includes(req.method)) &&
          !(req.method === 'POST' && path === '/api/mcp-config') &&
          !(consumerRead || (!connection && personalFeedbackRequest(req.method, path)))
        )
          fail(403, 'TOKEN_SCOPE', '个人 CLI/MCP 令牌仅允许目录与内容读取，请通过网页会话管理');
        res.locals.token = r;
        res.locals.credential = { kind: connection ? 'oauth' : 'personal', id: r.id };
      } else {
        const s = await this.session(req);
        if (!s) fail(401, 'UNAUTHENTICATED', '请登录');
        p = await this.hub.identity.principal(s.user_id);
        res.locals.session = s;
      }
      res.locals.principal = p;
      next();
    } catch (e) {
      if (!(e instanceof HubError)) res.locals.identity_refresh_failed = true;
      res.setHeader(
        'WWW-Authenticate',
        `Bearer realm="capability-hub", resource_metadata="${this.config.publicUrl}/.well-known/oauth-protected-resource"`,
      );
      next(e);
    }
  };
  csrf = async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && !res.locals.token) {
        const origin = req.headers.origin;
        if (
          origin !== new URL(this.config.publicUrl).origin &&
          !(!this.config.production && origin === 'http://127.0.0.1:5173')
        )
          fail(403, 'ORIGIN_REJECTED', '请求来源无效');
        const s = res.locals.session ?? (await this.session(req));
        if (!s || req.headers['x-csrf-token'] !== s.csrf)
          fail(403, 'CSRF_REJECTED', '页面会话已变化，请刷新后重试');
      }
      next();
    } catch (e) {
      next(e);
    }
  };
  origin(req: Pick<Request, 'headers'>) {
    const origin = req.headers.origin;
    if (
      origin !== new URL(this.config.publicUrl).origin &&
      !(!this.config.production && origin === 'http://127.0.0.1:5173')
    )
      fail(403, 'ORIGIN_REJECTED', '请求来源无效');
  }
  async startSession(
    req: Pick<Request, 'get'>,
    res: Response,
    user: Parameters<HubServices['sessions']['create']>[0],
  ) {
    const { token } = await this.hub.sessions.create(
      user,
      readSessionClient(req.get('User-Agent')),
    );
    res.cookie('hub_session', token, {
      ...this.sessionCookie,
      maxAge: 8 * 3600000,
    });
  }
  clearSessionCookie(res: Response) {
    res.clearCookie('hub_session', this.sessionCookie);
  }
}
