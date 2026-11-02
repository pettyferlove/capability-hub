import { hubPageFor } from '@capability-hub/contracts/web-pages';
import type { Express } from 'express';
import express from 'express';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

/** 只有页面路由返回 SPA 入口，API 与不存在的静态资源保留各自的错误。 */
export function registerWebRoutes(app: Express, directory: string): void {
  const index = join(directory, 'index.html');
  if (!existsSync(index)) return;
  app.use(
    express.static(directory, {
      index: false,
      setHeaders: (response) => response.setHeader('Cache-Control', 'no-cache'),
    }),
  );
  app.get(/.*/, (req, res, next) => {
    if (!hubPageFor(req.originalUrl) || !req.accepts('html')) return next();
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(index);
  });
}
