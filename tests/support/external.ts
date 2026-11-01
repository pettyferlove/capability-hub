import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { Client } from 'minio';

/** 外部集成测试要求显式提供连接参数；缺变量时给出可执行的命令提示，而不是回落到本地替身。 */
export function externalVariable(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`缺少隔离测试环境变量 ${name}，请运行 pnpm test:external`);
  return value;
}
/**
 * 在共享 PostgreSQL 上建一次性数据库，返回连接串与 `close()`（关连接池并删库）。
 * 用随机库名保证并行用例互不可见；用毕必须 `close()`，否则会在服务器上留垃圾库。
 */
export async function externalDatabase() {
  const url = new URL(externalVariable('CAPABILITY_HUB_TEST_DATABASE_URL'));
  const admin = new Pool({ connectionString: url.toString(), max: 1 });
  const name = 'hub_test_' + randomUUID().replaceAll('-', '');
  await admin.query(`CREATE DATABASE ${name}`);
  url.pathname = '/' + name;
  return {
    url: url.toString(),
    async close() {
      try {
        await admin.query(`DROP DATABASE ${name}`);
      } finally {
        await admin.end();
      }
    },
  };
}
/**
 * 建一次性 MinIO bucket，分别返回管理凭据与应用凭据，模拟真实部署里两者的权限差异。
 * `close()` 先清空对象再删 bucket —— 非空 bucket 无法删除。
 */
export async function externalBucket() {
  const endpoint = new URL(externalVariable('CAPABILITY_HUB_TEST_MINIO_ENDPOINT'));
  const admin = new Client({
    endPoint: endpoint.hostname,
    port: Number(endpoint.port),
    useSSL: false,
    accessKey: 'hub_test',
    secretKey: externalVariable('CAPABILITY_HUB_TEST_PASSWORD'),
  });
  const bucket = 'hub-test-' + randomUUID();
  await admin.makeBucket(bucket, 'us-east-1');
  return {
    bucket,
    admin,
    endpoint: endpoint.origin,
    options: {
      endPoint: endpoint.hostname,
      port: Number(endpoint.port),
      useSSL: false,
      accessKey: 'hub_test_application',
      secretKey: externalVariable('CAPABILITY_HUB_TEST_APP_SECRET'),
    },
    async close() {
      const listing = admin.listObjectsV2(bucket, '', true);
      try {
        for await (const raw of listing) {
          const item: unknown = raw;
          if (item && typeof item === 'object' && 'name' in item && typeof item.name === 'string')
            await admin.removeObject(bucket, item.name);
        }
      } finally {
        listing.destroy();
      }
      await admin.removeBucket(bucket);
    },
  };
}
