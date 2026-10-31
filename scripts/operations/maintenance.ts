import { blobReferences } from '@capability-hub/infrastructure/store';
import { openOperations } from './runtime.js';
import { purgeAiHistory } from '@capability-hub/infrastructure/ai';
const runtime = await openOperations();
const { store, blobs } = runtime;
let removed = 0;
let aiRemoved: number;
try {
  // 对象回收必须在 API 和 Worker 全部停止后执行，避免与尚未提交的内容竞争。
  if (process.argv.includes('--collect-blobs')) {
    const refs = new Set(
      blobReferences({
        versions: await store.all('versions'),
        intakes: await store.all('intakes'),
      }),
    );
    for await (const item of blobs.list())
      if (!refs.has(item.hash) && item.modifiedAt < Date.now() - 86400000) {
        await blobs.remove(item.hash);
        removed++;
      }
  }
  await store.tx(async () => {
    for (const row of await store.all('idempotency'))
      if (row.expires_at < Date.now()) await store.remove('idempotency', row.id);
    for (const row of await store.all('cli_logins'))
      if (row.expires_at < Date.now()) await store.remove('cli_logins', row.id);
    for (const row of await store.all('oauth_requests'))
      if (row.expires_at < Date.now() && row.status !== 'consumed')
        await store.remove('oauth_requests', row.id);
    for (const row of await store.all('oauth_credentials'))
      if (row.kind === 'access' && row.expires_at < Date.now())
        await store.remove('oauth_credentials', row.id);
    for (const row of await store.all('login_attempts'))
      if (row.window_expires_at < Date.now()) await store.remove('login_attempts', row.id);
  });
  aiRemoved = await purgeAiHistory(store);
} finally {
  await runtime.close();
}
process.stdout.write(
  `已清理过期运行记录和 ${aiRemoved} 个超过 30 天的 AI 终态执行；清理 ${removed} 个至少 24 小时未被任何版本或接收记录引用的对象。\n`,
);
