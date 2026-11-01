import { test } from 'node:test';
import { createSqliteStore } from '../support/store.js';
import { assertCrashRecovery, assertLeaseIsolation } from '../support/ai-recovery-assertions.js';

for (const stage of ['effect', 'terminal', 'resume'] as const)
  test(`SQLite AI SIGKILL ${stage} 窗口恢复`, { timeout: 20000 }, async (t) => {
    const fixture = await createSqliteStore(t);
    await assertCrashRecovery(t, fixture.store, { driver: 'sqlite', path: fixture.path }, stage);
  });

test('SQLite AI 过期、接管与共享事务回滚、完整备份恢复', async (t) => {
  const fixture = await createSqliteStore(t);
  await assertLeaseIsolation(t, fixture.store);
});
