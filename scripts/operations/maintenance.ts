import { blobReferences } from '@capability-hub/infrastructure/store';
import { openOperations } from './runtime.js';
import { purgeAiHistory } from '@capability-hub/infrastructure/ai';

const runtime = await openOperations();
const { store, blobs } = runtime;
let removed = 0;
let attachmentsRemoved = 0;
let aiRemoved: number;
try {
  const now = Date.now();
  const removedAt = new Date(now).toISOString();
  const cutoff = new Date(now - 180 * 86400000).toISOString();
  const batchSize = 100;
  for (;;) {
    const count = await store.tx(async () => {
      const expired = await store.listExpiredHubFeedbackAttachments(cutoff, batchSize);
      const affected = new Set<string>();
      for (const attachment of expired) {
        await store.put('hub_feedback_attachments', {
          ...attachment,
          sha256: null,
          removed_at: removedAt,
          removed_by: null,
          removal_reason: 'retention',
        });
        await store.audit('system', 'hub_feedback.attachment_removed', attachment.feedback_id, '', {
          attachment_id: attachment.id,
          reason: 'retention',
        });
        affected.add(attachment.feedback_id);
      }
      for (const id of affected) {
        const feedback = await store.get('hub_feedback', id);
        if (!feedback) throw new Error(`反馈记录不存在：${id}`);
        await store.put('hub_feedback', {
          ...feedback,
          revision: feedback.revision + 1,
          updated_at: removedAt,
        });
      }
      return expired.length;
    });
    attachmentsRemoved += count;
    if (count < batchSize) break;
  }

  // 对象回收必须在 API 和 Worker 全部停止后执行，避免与尚未提交的内容竞争。
  if (process.argv.includes('--collect-blobs')) {
    const refs = new Set(
      blobReferences({
        versions: await store.all('versions'),
        intakes: await store.all('intakes'),
        hub_feedback_attachments: await store.all('hub_feedback_attachments'),
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
    for (const row of await store.all('install_tickets'))
      if (row.expires_at < Date.now()) await store.remove('install_tickets', row.id);
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
  `已清理过期运行记录和 ${aiRemoved} 个超过 30 天的 AI 终态执行；解除 ${attachmentsRemoved} 个反馈附件引用，回收 ${removed} 个未被引用且修改时间超过 24 小时的对象。\n`,
);
