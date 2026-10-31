import express, { type Express, type Request, type Response, type NextFunction } from 'express';
import { OAuthError } from '@capability-hub/application';
import { z } from 'zod';
import type { HttpContext } from '../context.js';
import { jsonRoute } from '../response.js';

export function registerOAuthRoutes(app: Express, { hub }: HttpContext): void {
  const base = hub.config.publicUrl;
  const resourceMetadata = {
    resource: base + '/mcp',
    resource_name: 'Capability Hub',
    authorization_servers: [base],
    bearer_methods_supported: ['header'],
    scopes_supported: ['hub:read', 'hub:contribute'],
  };
  app.get(
    ['/.well-known/oauth-protected-resource', '/.well-known/oauth-protected-resource/mcp'],
    (_req, res) => res.json(resourceMetadata),
  );
  app.get('/.well-known/oauth-authorization-server', (_req, res) =>
    res.json({
      issuer: base,
      authorization_endpoint: base + '/oauth/authorize',
      token_endpoint: base + '/oauth/token',
      registration_endpoint: base + '/oauth/register',
      revocation_endpoint: base + '/oauth/revoke',
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      token_endpoint_auth_methods_supported: ['none'],
      revocation_endpoint_auth_methods_supported: ['none'],
      code_challenge_methods_supported: ['S256'],
      scopes_supported: ['hub:read', 'hub:contribute'],
      authorization_response_iss_parameter_supported: true,
    }),
  );
  app.use('/oauth', express.urlencoded({ extended: false, limit: '16kb', parameterLimit: 20 }));
  // 限制匿名注册和请求洪泛；有上限的窗口缓存不随任意 IP 无限增长。
  const requests = new Map<string, { count: number; until: number }>();
  app.use('/oauth', (req, res, next) => {
    const now = Date.now();
    for (const [key, item] of requests) if (item.until <= now) requests.delete(key);
    // 与 Express 默认的大小写和尾斜杠匹配保持一致，避免路径变体绕过限流。
    const endpoint = req.path.toLowerCase().replace(/\/$/, '');
    if (!['/register', '/authorize', '/token', '/revoke'].includes(endpoint)) {
      next();
      return;
    }
    const key = endpoint + ':' + (req.ip ?? 'unknown');
    const limit = endpoint === '/register' ? 30 : endpoint === '/token' ? 120 : 60;
    const item = requests.get(key) ?? { count: 0, until: now + 60_000 };
    if ((requests.size >= 4096 && !requests.has(key)) || ++item.count > limit) {
      res.set('Retry-After', '60').status(429).json({ error: 'temporarily_unavailable' });
      return;
    }
    requests.set(key, item);
    next();
  });
  const route =
    (call: (req: Request, res: Response) => Promise<void>) =>
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        await call(req, res);
      } catch (error) {
        if (error instanceof OAuthError)
          res.status(error.status).json({ error: error.code, error_description: error.message });
        else next(error);
      }
    };
  app.post(
    '/oauth/register',
    route(async (req, res) => {
      res.status(201).json(await hub.oauth.register(req.body));
    }),
  );
  app.get(
    '/oauth/authorize',
    route(async (req, res) => {
      const id = await hub.oauth.begin(req.query);
      res.redirect(302, '/connect?authorization=' + encodeURIComponent(id));
    }),
  );
  app.post(
    '/oauth/token',
    route(async (req, res) => {
      res.json(await hub.oauth.exchange(req.body));
    }),
  );
  app.post(
    '/oauth/revoke',
    route(async (req, res) => {
      await hub.oauth.revoke(req.body);
      res.json({});
    }),
  );
}
export function registerConnectionRoutes(app: Express, { hub }: HttpContext): void {
  app.get(
    '/api/connections',
    jsonRoute(async (_req, res) => hub.oauth.list(res.locals.principal.id)),
  );
  app.delete(
    '/api/connections/:id',
    jsonRoute(async (req, res) => {
      await hub.oauth.disconnect(res.locals.principal.id, String(req.params.id));
      return { ok: true };
    }),
  );
  app.get(
    '/api/connections/authorize/:id',
    jsonRoute(async (req) => hub.oauth.describe(String(req.params.id))),
  );
  app.post(
    '/api/connections/authorize/:id',
    jsonRoute(async (req, res) => {
      const input = z
        .object({ allow: z.boolean(), contribute: z.boolean().default(false) })
        .strict()
        .parse(req.body);
      return hub.oauth.decide(
        res.locals.principal,
        String(req.params.id),
        input.allow,
        input.contribute,
      );
    }),
  );
}
