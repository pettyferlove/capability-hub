import type { Express } from 'express';
import { z } from 'zod';
import { fail } from '@capability-hub/domain/errors';
import { browserEvents, safeText } from '@capability-hub/logging/events';
import type { HttpContext } from '../context.js';
const entrySchema = z
  .object({
    event: z.enum(browserEvents),
    level: z.enum(['warn', 'error']),
    time: z.number().int().positive(),
    page: z.enum([
      '/',
      '/discover',
      '/publish',
      '/review',
      '/sources',
      '/connect',
      '/account',
      '/resource',
    ]),
    request_id: z.string().uuid().optional(),
    status: z.number().int().min(0).max(599).optional(),
    code: z
      .string()
      .regex(/^[A-Z0-9_]{1,80}$/)
      .optional(),
    error: z
      .object({
        type: z.string().max(80),
        code: z.string().max(80).optional(),
        stack: z.string().max(4000).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();
const batchSchema = z
  .object({ session_id: z.string().uuid(), entries: z.array(entrySchema).min(1).max(10) })
  .strict();
/** 匿名诊断独立校验来源、报文大小和进程内接收预算。 */
export function registerTelemetryRoutes(app: Express, { hub }: HttpContext): void {
  const clients = new Map<
    string,
    {
      start: number;
      count: number;
    }
  >();
  let start = Date.now(),
    total = 0;
  app.post('/telemetry/browser', (req, res) => {
    if (
      req.headers.origin !== new URL(hub.config.publicUrl).origin &&
      !(!hub.config.production && req.headers.origin === 'http://127.0.0.1:5173')
    )
      fail(403, 'ORIGIN_REJECTED', '请求来源无效');
    const now = Date.now();
    if (now - start >= 60000) {
      start = now;
      total = 0;
      clients.clear();
    }
    const key = req.ip ?? 'unknown';
    const client = clients.get(key) ?? { start: now, count: 0 };
    if (clients.size >= 1000 && !clients.has(key)) fail(429, 'TELEMETRY_LIMIT', '日志采集繁忙');
    clients.set(key, client);
    if (++client.count > 12 || ++total > 1000) fail(429, 'TELEMETRY_LIMIT', '日志采集过于频繁');
    const batch = batchSchema.parse(req.body);
    for (const entry of batch.entries) {
      if (Math.abs(now - entry.time) > 86400000) continue;
      const detail = {
        event: 'browser.telemetry',
        browser_event: entry.event,
        source: 'browser',
        session_id: batch.session_id,
        client_time: new Date(entry.time).toISOString(),
        page: entry.page,
        client_request_id: entry.request_id,
        status: entry.status,
        code: entry.code,
        error: entry.error
          ? {
              type: safeText(entry.error.type, 80),
              stack: safeText(
                (entry.error.stack ?? '')
                  .split('\n')
                  .filter((line) => /^\s*at /.test(line))
                  .slice(0, 12)
                  .join('\n'),
                4000,
              ),
            }
          : undefined,
      };
      hub.logs.logger[entry.event === 'http.failed' ? 'warn' : 'error'](detail);
    }
    res.status(204).end();
  });
}
