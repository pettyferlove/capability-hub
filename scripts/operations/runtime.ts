import { loadServerConfig } from '@capability-hub/server/config';
import { closeStorage, openStorage } from '@capability-hub/server/storage';
import { createLogger } from '@capability-hub/logging/server';
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
