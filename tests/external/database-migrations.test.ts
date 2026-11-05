import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Pool } from 'pg';
import { externalDatabase } from '../support/external.js';
import {
  assertRecommendationMigration,
  assertUnpublishedDeletionMigration,
  migrationRuntime,
} from '../support/migrations.js';

test('PostgreSQL 升级允许清理未发布内容，保留待审与正式发布证据', async (context) => {
  const runtime = await migrationRuntime(context, 'postgresql');
  const database = await externalDatabase();
  try {
    await assertUnpublishedDeletionMigration(context, runtime, {
      driver: 'postgresql',
      url: database.url,
      onPoolError: (error) => {
        throw error;
      },
    });
  } finally {
    await database.close();
  }
});

test('PostgreSQL 升级按用户和资源合并历史推荐，保留首次推荐', async (context) => {
  const runtime = await migrationRuntime(context, 'postgresql');
  const database = await externalDatabase();
  const pool = new Pool({ connectionString: database.url });
  try {
    await assertRecommendationMigration(
      context,
      runtime,
      {
        driver: 'postgresql',
        url: database.url,
        onPoolError: (error) => {
          throw error;
        },
      },
      async (votes) => {
        for (const vote of votes)
          await pool.query('INSERT INTO recommendations (id, data) VALUES ($1, $2)', [
            vote.id,
            vote,
          ]);
      },
    );
  } finally {
    await pool.end();
    await database.close();
  }
});

test('PostgreSQL 并发初始化、增量迁移、重复启动和失败回滚均保留正确迁移历史', async (context) => {
  const runtime = await migrationRuntime(context, 'postgresql');
  const database = await externalDatabase();
  const pool = new Pool({ connectionString: database.url });
  const options = {
    driver: 'postgresql' as const,
    url: database.url,
    onPoolError: (error: Error) => {
      throw error;
    },
  };
  try {
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
    assert.equal(
      (await pool.query('SELECT count(*) FROM drizzle.__drizzle_migrations')).rows[0].count,
      String(runtime.initialCount + 1),
    );
    assert.equal((await pool.query('SELECT count(*) FROM migration_probe')).rows[0].count, '1');
    const constraint = (
      await pool.query(
        "SELECT condeferrable, condeferred FROM pg_constraint WHERE conname='assets_id_current_release_id_releases_asset_id_id_fk'",
      )
    ).rows[0];
    assert.equal(constraint.condeferrable, true);
    assert.equal(constraint.condeferred, true);
    await runtime.append(
      'CREATE TABLE should_rollback (id TEXT);\n--> statement-breakpoint\nINSERT INTO missing_table VALUES (1);',
    );
    await assert.rejects(() => runtime.open(options));
    assert.equal(
      (await pool.query("SELECT to_regclass('should_rollback') AS name")).rows[0].name,
      null,
    );
    assert.equal(
      (await pool.query('SELECT count(*) FROM drizzle.__drizzle_migrations')).rows[0].count,
      String(runtime.initialCount + 1),
    );
    await pool.query("UPDATE drizzle.__drizzle_migrations SET hash='changed' WHERE id=1");
    await assert.rejects(() => runtime.open(options), /迁移历史/);
  } finally {
    await pool.end();
    await database.close();
  }
});
