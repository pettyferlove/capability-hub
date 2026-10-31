import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setImmediate } from 'node:timers/promises';
import { randomUUID } from 'node:crypto';
import { openRecordStore } from '@capability-hub/infrastructure/store';
import { createSqliteStore, deferred } from '../support/store.js';

const group = (name: string) => ({ id: randomUUID(), name, active: true, revision: 1 });

test('事务回滚撤销全部写入，即使调用方捕获了数据库错误或嵌套事务错误', async (context) => {
  const { store } = await createSqliteStore(context);
  const duplicate = group('团队');
  await assert.rejects(() =>
    store.tx(async () => {
      await store.insert('groups', duplicate);
      await assert.rejects(() => store.insert('groups', duplicate));
      await store.insert('groups', group('不应提交'));
    }),
  );
  assert.deepEqual(await store.all('groups'), []);
  await assert.rejects(
    () =>
      store.tx(async () => {
        await store.insert('groups', group('外层'));
        try {
          await store.tx(async () => {
            await store.insert('groups', group('内层'));
            throw new Error('嵌套失败');
          });
        } catch {}
      }),
    /嵌套失败/,
  );
  assert.deepEqual(await store.all('groups'), []);
});

test('等待所有并发写入后可整体提交，数据库返回的副本不能直接修改存储', async (context) => {
  const { store } = await createSqliteStore(context);
  const groups = [group('第一组'), group('第二组')];
  await store.tx(async () => {
    await Promise.all(groups.map((value) => store.insert('groups', value)));
  });
  assert.equal((await store.all('groups')).length, 2);
  const first = await store.get('groups', groups[0].id);
  assert(first);
  first.name = '未提交的编辑';
  assert.equal((await store.get('groups', first.id))?.name, '第一组');
});

test('事务回调结束前未等待的写入触发整体回滚', async (context) => {
  const { store } = await createSqliteStore(context);
  let pending: Promise<unknown> | undefined;
  await assert.rejects(
    () =>
      store.tx(() => {
        pending = store.insert('groups', group('越界写入'));
        void pending.catch(() => {});
      }),
    /unfinished|completed/,
  );
  await Promise.allSettled([pending!]);
  assert.deepEqual(await store.all('groups'), []);
});

test('事务中启动的迟到任务不能在提交后写入', async (context) => {
  const { store } = await createSqliteStore(context);
  const gate = deferred();
  let late!: Promise<unknown>;
  await store.tx(async () => {
    late = (async () => {
      await gate.promise;
      return await store.insert('groups', group('迟到写入'));
    })();
    await store.insert('groups', group('正常写入'));
  });
  gate.resolve();
  await assert.rejects(late, /completed/);
  assert.equal((await store.all('groups')).length, 1);
});

test('事务内关闭存储被拒绝并回滚，存储仍能继续使用', async (context) => {
  const { store } = await createSqliteStore(context);
  await assert.rejects(
    () =>
      store.tx(async () => {
        await store.insert('groups', group('未提交'));
        try {
          await store.close();
        } catch {}
      }),
    /Cannot close/,
  );
  assert.deepEqual(await store.all('groups'), []);
  await store.health();
});

test('同文件第二个连接异步等待事务释放，重复关闭返回同一任务', async (context) => {
  const { store, path } = await createSqliteStore(context);
  const entered = deferred();
  const gate = deferred();
  const transaction = store.tx(async () => {
    entered.resolve();
    await gate.promise;
  });
  await entered.promise;
  let opened = false;
  const opening = openRecordStore({ driver: 'sqlite', path }).then((connection) => {
    opened = true;
    return connection;
  });
  try {
    await setImmediate();
    assert.equal(opened, false);
  } finally {
    gate.resolve();
  }
  await transaction;
  const second = await opening;
  const closing = second.close();
  assert.equal(second.close(), closing);
  await closing;
  await assert.rejects(() => second.health(), /closing|closed/);
});

test('审计追加后不能修改或删除，目录修订随实际业务变更失效', async (context) => {
  const { store } = await createSqliteStore(context);
  const before = await store.revision();
  const value = await store.insert('groups', group('审计团队'));
  const afterInsert = await store.revision();
  assert.notEqual(afterInsert, before);
  await store.audit('system', 'identity.group_created', value.id);
  const [event] = await store.all('audit');
  assert.equal(event.subject?.name, '审计团队');
  await assert.rejects(() => store.put('audit', { ...event, reason: '修改证据' }));
  await assert.rejects(() => store.remove('audit', event.id));
  await store.put('groups', { ...value, name: '更名后', revision: 2 });
  assert.notEqual(await store.revision(), afterInsert);
  assert.equal((await store.get('audit', event.id))?.subject?.name, '审计团队');
});

test('写入前拒绝不符合当前结构的记录，捕获校验异常也不能提交其他写入', async (context) => {
  const { store } = await createSqliteStore(context);
  const invalid = { ...group('无效记录'), active: 'true' } as unknown as Parameters<
    typeof store.insert<'groups'>
  >[1];
  await assert.rejects(() => store.insert('groups', invalid));
  assert.deepEqual(await store.all('groups'), []);
  const valid = group('原记录');
  await store.insert('groups', valid);
  await assert.rejects(() =>
    store.tx(async () => {
      await store.insert('groups', group('应回滚'));
      await assert.rejects(() => store.put('groups', { ...valid, revision: 0 }));
    }),
  );
  assert.deepEqual(await store.all('groups'), [valid]);
});
