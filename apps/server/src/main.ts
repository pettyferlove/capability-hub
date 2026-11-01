import { createLogger } from '@capability-hub/logging/server';
import { createApp } from './app.js';
import { loadServerConfig } from './config/server-config.js';
/**
 * 启动与优雅停机。`SIGTERM`/`SIGINT`、监听失败、未捕获异常和未处理的 Promise 拒绝都走同一条
 * `stop()`：只执行一次（`stopping` 去重），退出码取出现过的最严重值；先停 worker，再停止接收
 * 新连接、等现有连接结束，最后关存储并 flush 日志。整体 60 秒截止，超时直接 `exit(1)` 并记
 * `server.shutdown_timeout`——宁可被外部重启，也不无限期挂在半关闭状态。
 * 启动期任何失败都以 `server.start_failed` 记录并退出码 1，避免容器认为进程仍健康。
 */
async function main() {
  const config = loadServerConfig();
  const logger = createLogger({
    service: 'capability-hub',
    level: config.logLevel,
    environment: config.production ? 'production' : 'development',
  });
  const runtime = await createApp(config, logger);
  const server = runtime.app.listen(config.port, config.host, () =>
    logger.info({
      event: 'server.started',
      public_url: config.publicUrl,
      database: runtime.store.kind,
      object_storage: runtime.blobs.kind,
    }),
  );
  let stopping = false,
    exitStatus = 0;
  async function stop(status = 0) {
    exitStatus = Math.max(exitStatus, status);
    if (stopping) return;
    stopping = true;
    void runtime.worker.stop();
    const deadline = setTimeout(() => {
      logger.fatal({ event: 'server.shutdown_timeout' });
      process.exit(1);
    }, 60000);
    deadline.unref();
    try {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
      await runtime.close();
      logger.info({ event: 'server.stopped', exit_status: exitStatus });
      await new Promise<void>((resolve, reject) =>
        logger.flush((error) => (error ? reject(error) : resolve())),
      );
      clearTimeout(deadline);
      process.exit(exitStatus);
    } catch (err) {
      logger.fatal({ event: 'server.shutdown_failed', err });
      process.exit(1);
    }
  }
  server.on('error', (err) => {
    logger.fatal({ event: 'server.listen_failed', err });
    void stop(1);
  });
  process.on('SIGTERM', () => void stop());
  process.on('SIGINT', () => void stop());
  process.on('uncaughtException', (err) => {
    logger.fatal({ event: 'process.uncaught_exception', err });
    void stop(1);
  });
  process.on('unhandledRejection', (err) => {
    logger.fatal({ event: 'process.unhandled_rejection', err });
    void stop(1);
  });
}
await main().catch((err) => {
  createLogger({ service: 'capability-hub' }).fatal({ event: 'server.start_failed', err });
  process.exit(1);
});
