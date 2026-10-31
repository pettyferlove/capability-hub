import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { digest } from '@capability-hub/domain/canonical';
import { HubError } from '@capability-hub/domain/errors';
import { createTestHub } from '../support/application.js';

test('幂等记录到期即可重新使用，失败重试回滚清理与写入，不依赖定时维护释放键', async (context) => {
  const fixture = await createTestHub(context);
  const key = randomUUID();
  const execute = fixture.hub.idempotency.execute.bind(fixture.hub.idempotency);
  const first = await execute(fixture.admin, 'group-command', key, digest('first'), async () => {
    await fixture.store.insert('groups', {
      id: 'first-group',
      name: '第一次提交',
      active: true,
      revision: 1,
    });
    return { id: 'first-group' };
  });
  assert.deepEqual(
    await execute(fixture.admin, 'group-command', key, digest('first'), () => {
      throw new Error('重复请求不能执行');
    }),
    first,
  );
  await assert.rejects(
    () => execute(fixture.admin, 'group-command', key, digest('second'), () => ({})),
    (error: unknown) => error instanceof HubError && error.code === 'IDEMPOTENCY_CONFLICT',
  );
  const record = (await fixture.store.all('idempotency'))[0];
  context.mock.method(Date, 'now', () => record.expires_at);
  await assert.rejects(
    () =>
      execute(fixture.admin, 'group-command', key, digest('second'), async () => {
        await fixture.store.insert('groups', {
          id: 'failed-group',
          name: '需要回滚',
          active: true,
          revision: 1,
        });
        throw new Error('业务失败');
      }),
    /业务失败/,
  );
  assert.equal(await fixture.store.get('groups', 'failed-group'), undefined);
  assert(await fixture.store.get('idempotency', record.id));
  const result = await execute(fixture.admin, 'group-command', key, digest('second'), () => ({
    id: 'second-result',
  }));
  assert.deepEqual(result, { id: 'second-result' });
  const current = await fixture.store.all('idempotency');
  assert.equal(current.length, 1);
  assert.notEqual(current[0].id, record.id);
  assert.equal(current[0].request_hash, digest('second'));
});
