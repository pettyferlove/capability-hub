import { join } from 'node:path';
import { loadServerConfig } from '@capability-hub/server/config';
import { openRecordStore } from '@capability-hub/infrastructure/store';
import { createLogger } from '@capability-hub/logging/server';

const config = loadServerConfig({ worker: false });
const logger = createLogger({ service: 'capability-hub-migrations', level: config.logLevel });
const store = await openRecordStore(
  config.database.driver === 'sqlite'
    ? { driver: 'sqlite', path: join(config.dataDir, 'hub.sqlite') }
    : {
        ...config.database,
        onPoolError: (error) => logger.error({ err: error }, '数据库连接错误'),
      },
);
try {
  await store.health();
  process.stdout.write(`数据库迁移完成：${store.kind}\n`);
} finally {
  await store.close();
}
