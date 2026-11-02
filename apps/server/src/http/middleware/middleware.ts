import { boundedJson } from '@capability-hub/infrastructure/content';
import { HubError } from '@capability-hub/domain/errors';
import type { Express } from 'express';
import express from 'express';
import type { LogContext } from '@capability-hub/logging/server';
import { type RequestMetrics } from '../../observability/request-metrics.js';
import type { ServerConfig } from '../../config/server-config.js';

/** 顺序影响安全边界：先记录请求并校验来源，再解析有大小限制的 JSON。 */
export function configureHttp(
  app: Express,
  config: ServerConfig,
  metrics: RequestMetrics,
  logs: LogContext,
): void {
  app.disable('x-powered-by');
  app.set('query parser', 'simple');
  app.use(logs.http(config.requestLogging));
  app.use((_req, res, next) => {
    const started = performance.now();
    metrics.active++;
    let recorded = false;
    const done = (aborted = false) => {
      if (recorded) return;
      recorded = true;
      metrics.active--;
      if (aborted) metrics.aborted++;
      const duration = performance.now() - started;
      metrics.record(res.statusCode, duration);
    };
    res.once('finish', () => done());
    res.once('close', () => done(!res.writableFinished));
    next();
  });
  app.use((req, res, next) => {
    if (!('id' in req) || typeof req.id !== 'string')
      throw new Error('HTTP request id was not initialized');
    res.locals.request_id = req.id;
    res.set({
      'X-Request-Id': res.locals.request_id,
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Cache-Control': 'private, no-store',
      'Content-Security-Policy':
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
    });
    const allowed = [
      new URL(config.publicUrl).host,
      ...(!config.production ? ['127.0.0.1:5173', 'localhost:4100'] : []),
    ];
    if (req.headers.host && !allowed.includes(req.headers.host)) {
      next(new HubError(403, 'HOST_REJECTED', '请求 Host 无效'));
      return;
    }
    const oauthPublic =
      /^\/(?:oauth\/(?:token|register|revoke)|\.well-known\/oauth-(?:authorization-server|protected-resource)(?:\/mcp)?)$/.test(
        req.path,
      );
    const mcpBearer = req.path === '/mcp';
    if (oauthPublic || mcpBearer) {
      res.set({
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
        'Access-Control-Allow-Headers':
          'Authorization, Content-Type, MCP-Protocol-Version, MCP-Session-Id',
        'Access-Control-Expose-Headers': 'WWW-Authenticate, MCP-Session-Id',
      });
      if (req.method === 'OPTIONS') {
        res.sendStatus(204);
        return;
      }
    }
    if (
      !oauthPublic &&
      !mcpBearer &&
      req.headers.origin &&
      req.headers.origin !== new URL(config.publicUrl).origin &&
      (!config.production ? req.headers.origin !== 'http://127.0.0.1:5173' : true)
    ) {
      next(new HubError(403, 'ORIGIN_REJECTED', '请求来源无效'));
      return;
    }
    next();
  });
  app.use('/telemetry/browser', express.json({ limit: '32kb' }));
  app.use(
    express.json({
      limit: '1mb',
      verify: (_req, _res, buf) => {
        boundedJson(buf.toString());
      },
    }),
  );
}
