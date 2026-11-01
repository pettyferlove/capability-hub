import type {} from './http/types/express.js';
import { createLogger, LogContext, type Logger } from '@capability-hub/logging/server';
import { closeStorage, openStorage } from './bootstrap/storage.js';
import { HubError } from '@capability-hub/domain/errors';
import express, { type Express } from 'express';
import type { BlobStorage, BlobMaintenance, RecordStore } from '@capability-hub/application/ports';
import { registerTelemetryRoutes } from './http/routes/telemetry-routes.js';
import {
  registerCatalogRoutes,
  registerProtectedCatalogRoutes,
} from './http/routes/catalog-routes.js';
import { registerErrorHandler } from './http/middleware/error-handler.js';
import { registerIdentityRoutes } from './http/routes/identity-routes.js';
import { registerIntakesRoutes } from './http/routes/intakes-routes.js';
import { registerInstallationRoutes } from './http/routes/installation-routes.js';
import { registerLifecycleRoutes } from './http/routes/lifecycle-routes.js';
import { registerMcpRoutes } from './http/routes/mcp-routes.js';
import { configureHttp } from './http/middleware/middleware.js';
import { registerOAuthRoutes, registerConnectionRoutes } from './http/routes/oauth-routes.js';
import { registerPublicRoutes } from './http/routes/public-routes.js';
import { registerPublicationRoutes } from './http/routes/publication-routes.js';
import { registerSessionRoutes } from './http/routes/session-routes.js';
import { registerSourcesRoutes } from './http/routes/sources-routes.js';
import { registerWebRoutes } from './http/routes/web-routes.js';
import { HubServices } from './bootstrap/hub-services.js';
import { HttpSecurity } from './http/security/http-security.js';
import { registerProfileRoutes } from './http/routes/profile-routes.js';
import { registerAiRoutes } from './http/routes/ai-routes.js';
import { HubWorker } from './workers/hub-worker.js';
import { RequestMetrics } from './observability/operations.js';
import type { ServerConfig } from './config/server-config.js';

/**
 * 一个进程内实例的全部句柄，由 {@link createApp} 一次性装配：HTTP 应用与 worker 共用同一个
 * 存储和 `HubServices`，不要分别创建，否则幂等键、锁与缓冲会分裂到两套状态上。
 */
export interface AppRuntime {
  app: Express;
  store: RecordStore;
  blobs: BlobStorage & BlobMaintenance;
  hub: HubServices;
  sources: HubServices['sources'];
  worker: HubWorker;
  logger: Logger;
  /** 停 worker 后关存储；并发调用返回同一个 Promise，失败以 `AggregateError` 汇总。 */
  close: () => Promise<void>;
}

/** 在同一装配入口创建 HTTP 和后台任务所需的服务。 */
export async function createApp(
  config: ServerConfig,
  logger: Logger = createLogger({
    service: 'capability-hub',
    level: config.logLevel,
    environment: config.production ? 'production' : 'development',
  }),
): Promise<AppRuntime> {
  const logs = new LogContext(logger);
  const { store, blobs } = await openStorage(config, logger);
  try {
    const hub = new HubServices(store, blobs, config, logs);
    await hub.administration.initialize();
    const sources = hub.sources;
    const worker = new HubWorker(hub, sources);
    const app = express();
    const metrics = new RequestMetrics();
    const security = new HttpSecurity(hub);
    const context = { hub, sources, metrics, security, worker };
    configureHttp(app, config, metrics, logs);
    registerTelemetryRoutes(app, context);
    registerOAuthRoutes(app, context);
    registerPublicRoutes(app, context);
    registerCatalogRoutes(app, context);
    registerInstallationRoutes(app, context);
    // 仅消费读取允许匿名访问，管理和所有 API 写入均要求身份。
    app.use(['/api', '/mcp', '/auth/logout'], security.authenticate);
    app.use(['/api', '/auth/logout'], security.csrf);
    registerConnectionRoutes(app, context);
    registerProfileRoutes(app, context);
    registerSessionRoutes(app, context);
    registerIdentityRoutes(app, context);
    registerProtectedCatalogRoutes(app, context);
    registerSourcesRoutes(app, context);
    registerIntakesRoutes(app, context);
    registerPublicationRoutes(app, context);
    registerLifecycleRoutes(app, context);
    registerAiRoutes(app, context);
    registerMcpRoutes(app, context);
    registerWebRoutes(app, config.webDirectory);
    app.use((_req, _res, next) => next(new HubError(404, 'NOT_FOUND', '接口不存在')));
    registerErrorHandler(app, metrics, logs);
    if (config.worker) worker.start();
    let closing: Promise<void> | undefined;
    return {
      app,
      store,
      blobs,
      hub,
      sources,
      worker,
      logger,
      close: () => {
        if (closing) return closing;
        closing = (async () => {
          const failures: unknown[] = [];
          try {
            await worker.stop();
          } catch (error) {
            failures.push(error);
          }
          try {
            await closeStorage(store, blobs);
          } catch (error) {
            failures.push(error);
          }
          if (failures.length) throw new AggregateError(failures, '关闭应用失败');
        })();
        return closing;
      },
    };
  } catch (error) {
    await Promise.allSettled([store.close(), blobs.close()]);
    throw error;
  }
}
