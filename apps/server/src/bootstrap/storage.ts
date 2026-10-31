import { BlobStore, MinioBlobStore } from '@capability-hub/infrastructure/content';
import { openRecordStore } from '@capability-hub/infrastructure/store';
import type { BlobStorage, BlobMaintenance, RecordStore } from '@capability-hub/application/ports';
import type { Logger } from '@capability-hub/logging/server';
import { join } from 'node:path';
import type { ServerConfig } from '../config/server-config.js';
export async function openStorage(
  config: ServerConfig,
  logger: Logger,
): Promise<{
  store: RecordStore;
  blobs: BlobStorage & BlobMaintenance;
}> {
  let store: RecordStore;
  switch (config.database.driver) {
    case 'postgresql':
      store = await openRecordStore({
        ...config.database,
        onPoolError: (err) => logger.error({ event: 'database.pool_error', err }),
      });
      break;
    case 'sqlite':
      store = await openRecordStore({ driver: 'sqlite', path: join(config.dataDir, 'hub.sqlite') });
      break;
    default:
      throw new Error('数据库驱动无效');
  }
  let blobs: (BlobStorage & BlobMaintenance) | undefined;
  try {
    const options = config.objectStorage;
    if (options.driver === 'minio') {
      const url = new URL(options.endpoint);
      blobs = new MinioBlobStore(
        {
          endPoint: url.hostname.replace(/^\[|\]$/g, ''),
          port: Number(url.port || (url.protocol === 'https:' ? 443 : 80)),
          useSSL: url.protocol === 'https:',
          accessKey: options.accessKey,
          secretKey: options.secretKey,
          region: options.region,
        },
        options.bucket,
        options.prefix,
      );
    } else if (options.driver === 'filesystem')
      blobs = new BlobStore(join(config.dataDir, 'blobs'));
    else throw new Error('对象存储驱动无效');
    await blobs.health();
    return { store, blobs };
  } catch (error) {
    await Promise.allSettled([store.close(), ...(blobs ? [blobs.close()] : [])]);
    throw error;
  }
}

export async function closeStorage(store: RecordStore, blobs: BlobStorage): Promise<void> {
  const results = await Promise.allSettled([
    Promise.resolve().then(() => blobs.close()),
    Promise.resolve().then(() => store.close()),
  ]);
  const failures = results.flatMap((result) =>
    result.status === 'rejected' ? [result.reason as unknown] : [],
  );
  if (failures.length) throw new AggregateError(failures, '关闭存储失败');
}
