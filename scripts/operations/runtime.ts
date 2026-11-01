import { loadServerConfig } from '@capability-hub/server/config';
import { closeStorage, openStorage } from '@capability-hub/server/storage';
import { createLogger } from '@capability-hub/logging/server';

/**
 * 运维脚本的最小运行时：只开存储、不开 HTTP、强制 `worker: false`，避免一次性脚本与本机
 * 正在运行的服务抢同一批作业。传入 `dataDir` 可指向另一份数据（例如离线备份）。
 * 调用方必须 `await close()`，否则连接池不会释放。
 */
export async function openOperations(dataDir?: string) {
  const config = loadServerConfig({ ...(dataDir ? { dataDir } : {}), worker: false });
  const logger = createLogger({ service: 'capability-hub-operations', level: config.logLevel });
  const { store, blobs } = await openStorage(config, logger);
  return {
    store,
    blobs,
    config,
    async close() {
      await closeStorage(store, blobs);
    },
  };
}
