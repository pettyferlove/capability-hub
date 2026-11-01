import { test } from 'node:test';
import { openRecordStore } from '@capability-hub/infrastructure/store';
import { externalDatabase } from '../support/external.js';
import { assertCrashRecovery, assertLeaseIsolation } from '../support/ai-recovery-assertions.js';
import { assertActivityHistory } from '../support/ai-activity.js';

for (const stage of ['effect', 'terminal', 'resume'] as const)
  test(`PostgreSQL AI SIGKILL ${stage} 窗口恢复`, { timeout: 30000 }, async (t) => {
    const database = await externalDatabase();
    const store = await openRecordStore({
      driver: 'postgresql',
      url: database.url,
      onPoolError: (error: Error) => {
        throw error;
      },
    });
    try {
      await assertCrashRecovery(t, store, { driver: 'postgresql', url: database.url }, stage);
    } finally {
      await store.close();
      await database.close();
    }
  });

test('PostgreSQL AI 租约隔离、事务回滚和跨数据库备份', async (t) => {
  const database = await externalDatabase();
  const store = await openRecordStore({
    driver: 'postgresql',
    url: database.url,
    onPoolError: (error: Error) => {
      throw error;
    },
  });
  try {
    await assertLeaseIsolation(t, store);
  } finally {
    await store.close();
    await database.close();
  }
});

test('PostgreSQL 活动快照过滤、执行隔离、水位与重新打开一致', async () => {
  const database = await externalDatabase();
  const store = await openRecordStore({
    driver: 'postgresql',
    url: database.url,
    onPoolError: (error: Error) => {
      throw error;
    },
  });
  try {
    await assertActivityHistory(store);
  } finally {
    await store.close();
    await database.close();
  }
});
