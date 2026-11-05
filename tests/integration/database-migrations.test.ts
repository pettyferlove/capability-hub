import assert from 'node:assert/strict';
import { test } from 'node:test';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import {
  assertRecommendationMigration,
  assertUnpublishedDeletionMigration,
  migrationRuntime,
} from '../support/migrations.js';

test('SQLite 升级允许清理未发布内容，保留待审与正式发布证据', async (context) => {
  const runtime = await migrationRuntime(context, 'sqlite');
  await assertUnpublishedDeletionMigration(context, runtime, {
    driver: 'sqlite',
    path: join(runtime.directory, 'hub.sqlite'),
  });
});

test('认证来源迁移保留已有账号与角色绑定，只放开跨来源同名', async (context) => {
  const runtime = await migrationRuntime(context, 'sqlite');
  const options = { driver: 'sqlite' as const, path: join(runtime.directory, 'hub.sqlite') };
  const old = await runtime.openBefore(options, 2);
  const local = {
    id: randomUUID(),
    username: 'member',
    password_hash: 'local-hash',
    display_name: '成员',
    active: true,
    revision: 1,
    created_at: new Date().toISOString(),
  };
  const ldap = {
    ...local,
    id: randomUUID(),
    username: 'existing-ldap',
    password_hash: null,
    ldap_entry_uuid: randomUUID(),
  };
  const role = {
    id: randomUUID(),
    key: 'reader',
    name: '使用者',
    permissions: [],
    builtin: true,
    revision: 1,
  };
  const grant = {
    id: randomUUID(),
    role_id: role.id,
    principal_id: ldap.id,
    scope_type: 'platform' as const,
    scope_id: '',
  };
  try {
    await old.insert('users', local);
    await old.insert('users', ldap);
    await old.insert('roles', role);
    await old.insert('role_bindings', grant);
  } finally {
    await old.close();
  }
  const store = await runtime.open(options);
  context.after(() => store.close());
  assert.deepEqual(await store.get('users', local.id), local);
  assert.deepEqual(await store.get('users', ldap.id), ldap);
  assert.deepEqual(await store.get('role_bindings', grant.id), grant);
  await store.put('users', { ...ldap, username: local.username });
  await assert.rejects(() => store.insert('users', { ...local, id: randomUUID() }));
  await assert.rejects(() =>
    store.insert('users', {
      ...ldap,
      id: randomUUID(),
      ldap_entry_uuid: randomUUID(),
      username: local.username,
    }),
  );
  await assert.rejects(() =>
    store.insert('users', { ...ldap, id: randomUUID(), username: 'another-uid' }),
  );
});

test('SQLite 升级按用户和资源合并历史推荐，保留首次推荐', async (context) => {
  const runtime = await migrationRuntime(context, 'sqlite');
  const path = join(runtime.directory, 'hub.sqlite');
  await assertRecommendationMigration(context, runtime, { driver: 'sqlite', path }, (votes) => {
    const db = new DatabaseSync(path);
    try {
      const insert = db.prepare('INSERT INTO recommendations (id, data) VALUES (?, ?)');
      for (const vote of votes) insert.run(vote.id, JSON.stringify(vote));
    } finally {
      db.close();
    }
  });
});

test('SQLite 迁移首次并发打开只执行一次，后续迁移保留已有记录，重复打开不重放', async (context) => {
  const runtime = await migrationRuntime(context, 'sqlite');
  const path = join(runtime.directory, 'hub.sqlite');
  const options = { driver: 'sqlite' as const, path };
  const stores = await Promise.all([runtime.open(options), runtime.open(options)]);
  try {
    await stores[0].insert('groups', { id: 'g1', name: '迁移前', active: true, revision: 1 });
  } finally {
    await Promise.all(stores.map((store) => store.close()));
  }
  await runtime.append(
    "CREATE TABLE migration_probe (id TEXT PRIMARY KEY);\n--> statement-breakpoint\nINSERT INTO migration_probe VALUES ('once');",
  );
  for (let attempt = 0; attempt < 2; attempt++) {
    const store = await runtime.open(options);
    try {
      assert.equal((await store.get('groups', 'g1'))?.name, '迁移前');
    } finally {
      await store.close();
    }
  }
  const db = new DatabaseSync(path);
  try {
    assert.equal(
      db.prepare('SELECT count(*) AS count FROM __drizzle_migrations').get()?.count,
      runtime.initialCount + 1,
    );
    assert.equal(db.prepare('SELECT count(*) AS count FROM migration_probe').get()?.count, 1);
    assert.equal(
      db.prepare("SELECT strict FROM pragma_table_list WHERE name='groups'").get()?.strict,
      1,
    );
    assert.match(
      String(db.prepare("SELECT sql FROM sqlite_schema WHERE name='assets'").get()?.sql),
      /DEFERRABLE INITIALLY DEFERRED/,
    );
  } finally {
    db.close();
  }
});

test('SQLite 迁移失败整体回滚，包括 DDL 和迁移历史；修改后的历史被拒绝', async (context) => {
  const runtime = await migrationRuntime(context, 'sqlite');
  const path = join(runtime.directory, 'hub.sqlite');
  const options = { driver: 'sqlite' as const, path };
  await (await runtime.open(options)).close();
  await runtime.append(
    'CREATE TABLE should_rollback (id TEXT);\n--> statement-breakpoint\nINSERT INTO missing_table VALUES (1);',
  );
  await assert.rejects(() => runtime.open(options), /missing_table/);
  const db = new DatabaseSync(path);
  try {
    assert.equal(
      db.prepare("SELECT 1 FROM sqlite_schema WHERE name='should_rollback'").get(),
      undefined,
    );
    assert.equal(
      db.prepare('SELECT count(*) AS count FROM __drizzle_migrations').get()?.count,
      runtime.initialCount,
    );
    db.exec("UPDATE __drizzle_migrations SET hash='changed'");
  } finally {
    db.close();
  }
  await assert.rejects(() => runtime.open(options), /迁移历史/);
});
