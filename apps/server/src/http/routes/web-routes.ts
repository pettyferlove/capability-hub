import { hubPageFor } from '@capability-hub/contracts/web-pages';
import type { Express, NextFunction, Request, Response } from 'express';
import express from 'express';
import { existsSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';

const machinePaths = /^\/(?:api|mcp|auth|oauth|\.well-known|health|telemetry)(?:\/|$)/;
// Vite 构建产物的文件名使用 10 位 base36 内容哈希。
const hashedBuildAsset = /^[a-z0-9.-]+-[a-z0-9]{10}\.[a-z0-9]+$/;
const immutableAssetCache = 'public, max-age=31536000, immutable';

/**
 * 页面路由返回 SPA 入口；浏览器导航到未知地址时以 404 返回同一入口，由前端渲染 404 页。
 * 接口命名空间、不存在的静态资源和不偏好 HTML 的客户端保留统一 JSON 错误。
 */
export function registerWebRoutes(app: Express, directory: string): void {
  const index = join(directory, 'index.html');
  if (!existsSync(index)) return;
  const assets = resolve(directory, 'assets') + sep;
  app.use(
    express.static(directory, {
      index: false,
      setHeaders: (response, path) => {
        const immutable =
          path.startsWith(assets) && hashedBuildAsset.test(path.slice(assets.length));
        response.setHeader('Cache-Control', immutable ? immutableAssetCache : 'no-cache');
      },
    }),
    (error: unknown, _req: Request, res: Response, next: NextFunction) => {
      // 静态文件发送器先设置缓存头，再检查请求前置条件并读取文件。
      if (!res.headersSent && res.getHeader('Cache-Control') === immutableAssetCache)
        res.setHeader('Cache-Control', 'no-store');
      next(error);
    },
  );
  app.get(/.*/, (req, res, next) => {
    if (!hubPageFor(req.originalUrl) || !req.accepts('html')) return next();
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(index);
  });
  // 资源请求和接口客户端的 Accept 通常是 `*/*` 或 JSON，只有明确偏好 HTML 的导航才拿到页面。
  app.get(/.*/, (req, res, next) => {
    if (machinePaths.test(req.path) || req.accepts(['json', 'html']) !== 'html') return next();
    res.status(404).setHeader('Cache-Control', 'no-cache');
    res.sendFile(index);
  });
}
