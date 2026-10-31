import assert from 'node:assert/strict';
import { test } from 'node:test';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { migrationRuntime } from '../support/migrations.js';

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
    assert.equal(db.prepare('SELECT count(*) AS count FROM __drizzle_migrations').get()?.count, 2);
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
    assert.equal(db.prepare('SELECT count(*) AS count FROM __drizzle_migrations').get()?.count, 1);
    db.exec("UPDATE __drizzle_migrations SET hash='changed'");
  } finally {
    db.close();
  }
  await assert.rejects(() => runtime.open(options), /迁移历史/);
});
