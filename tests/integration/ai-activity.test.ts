import { test } from 'node:test';
import { createSqliteStore } from '../support/store.js';
import { assertActivityHistory } from '../support/ai-activity.js';

test('SQLite 活动快照先过滤文本增量再分页，并按执行和水位隔离', async (t) => {
  const { store } = await createSqliteStore(t);
  await assertActivityHistory(store);
});
