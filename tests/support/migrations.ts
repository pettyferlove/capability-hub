import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { TestContext } from 'node:test';
import {
  snapshotStore,
  type openRecordStore,
  type RecordStoreOptions,
  type restoreStore,
} from '@capability-hub/infrastructure/store';
import { createTestHub, publishSkill, receiveSkill, submitPublication } from './application.js';

/** 在隔离的部署副本里追加迁移，验证真实执行器，不改工作区或当前数据库。 */
export async function migrationRuntime(context: TestContext, dialect: 'sqlite' | 'postgresql') {
  const directory = await mkdtemp(join(tmpdir(), 'hub-migration-'));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const entry = fileURLToPath(import.meta.resolve('@capability-hub/infrastructure/store'));
  const source = dirname(entry);
  await cp(source, join(directory, 'src'), { recursive: true });
  await writeFile(join(directory, 'package.json'), '{"type":"module"}');
  await symlink(
    fileURLToPath(new URL('../../packages/infrastructure/node_modules', import.meta.url)),
    join(directory, 'node_modules'),
    'dir',
  );
  const runtime = (await import(pathToFileURL(join(directory, 'src/store.ts')).href)) as {
    openRecordStore: typeof openRecordStore;
    restoreStore: typeof restoreStore;
  };
  const folder = join(directory, 'src/persistence', dialect, 'migrations');
  const journalPath = join(folder, 'meta/_journal.json');
  const complete = await readFile(journalPath, 'utf8');
  const initialJournal = JSON.parse(complete) as {
    entries: unknown[];
  };
  return {
    directory,
    initialCount: initialJournal.entries.length,
    open: runtime.openRecordStore,
    restore: runtime.restoreStore,
    async openBefore(options: RecordStoreOptions, index: number) {
      const entries = initialJournal.entries.slice(0, index);
      await writeFile(journalPath, JSON.stringify({ ...initialJournal, entries }));
      try {
        return await runtime.openRecordStore(options);
      } finally {
        await writeFile(journalPath, complete);
      }
    },
    async append(sql: string) {
      const path = join(folder, 'meta/_journal.json');
      const journal = JSON.parse(await readFile(path, 'utf8')) as {
        version: string;
        entries: {
          idx: number;
          version: string;
          when: number;
          tag: string;
          breakpoints: boolean;
        }[];
      };
      const previous = journal.entries.at(-1)!;
      const tag = `${String(previous.idx + 1).padStart(4, '0')}_test`;
      journal.entries.push({ ...previous, idx: previous.idx + 1, when: previous.when + 1, tag });
      await writeFile(join(folder, tag + '.sql'), sql);
      await writeFile(path, JSON.stringify(journal));
    },
  };
}

/** 历史推荐按旧表结构直接写入，迁移结果通过当前 RecordStore 读取并校验。 */
export async function assertRecommendationMigration(
  context: TestContext,
  runtime: Awaited<ReturnType<typeof migrationRuntime>>,
  options: RecordStoreOptions,
  insertVotes: (
    votes: { id: string; user_id: string; version_id: string; created_at: string }[],
  ) => void | Promise<void>,
) {
  const fixture = await createTestHub(context);
  const { intake: first } = await publishSkill(fixture);
  const { intake: second } = await publishSkill(fixture, {
    assetId: first.asset_id,
    version: '2.0.0',
  });
  const { intake: other } = await publishSkill(fixture, { slug: 'other-skill' });
  const old = await runtime.openBefore(options, 3);
  try {
    await runtime.restore(old, await snapshotStore(fixture.store));
  } finally {
    await old.close();
  }

  const earliest = {
    id: 'reader-z',
    user_id: fixture.reader.id,
    created_at: '2026-01-01T00:00:00Z',
  };
  const reviewer = {
    id: 'reviewer-a',
    user_id: fixture.reviewer.id,
    created_at: '2026-01-01T00:00:00.1Z',
  };
  const anotherAsset = { ...earliest, id: 'other' };
  await insertVotes([
    {
      ...earliest,
      id: 'reader-a',
      version_id: second.version_id,
      created_at: '2026-01-01T00:00:00.00000001Z',
    },
    { ...earliest, version_id: first.version_id },
    { ...reviewer, version_id: second.version_id },
    {
      ...reviewer,
      id: 'reviewer-z',
      version_id: first.version_id,
      created_at: '2026-01-01T00:00:00.100Z',
    },
    { ...anotherAsset, version_id: other.version_id },
  ]);

  const store = await runtime.open(options);
  try {
    const retained = { ...earliest, asset_id: first.asset_id };
    assert.deepEqual(
      new Set(await store.all('recommendations')),
      new Set([
        retained,
        { ...reviewer, asset_id: first.asset_id },
        { ...anotherAsset, asset_id: other.asset_id },
      ]),
    );
    await assert.rejects(() => store.insert('recommendations', { ...retained, id: 'duplicate' }));
  } finally {
    await store.close();
  }
}

/** 从禁止全部删除的旧库升级，只放行已结束审核且从未发布的内容清理。 */
export async function assertUnpublishedDeletionMigration(
  context: TestContext,
  runtime: Awaited<ReturnType<typeof migrationRuntime>>,
  options: RecordStoreOptions,
) {
  const fixture = await createTestHub(context);
  const published = await publishSkill(fixture);
  const draft = await receiveSkill(fixture, { slug: 'draft' });
  const cancelled = await submitPublication(fixture, draft);
  await fixture.hub.publications.cancel(fixture.admin, cancelled.id, { reason: '放弃发布' }, '"1"');
  const pending = await receiveSkill(fixture, { slug: 'pending' });
  const request = await submitPublication(fixture, pending);
  const snapshot = await snapshotStore(fixture.store);
  const old = await runtime.openBefore(options, 4);
  try {
    await runtime.restore(old, snapshot);
    await assert.rejects(() => old.remove('requests', cancelled.id), /immutable/);
  } finally {
    await old.close();
  }
  const upgraded = await runtime.open(options);
  try {
    assert.deepEqual(
      await upgraded.get('versions', published.intake.version_id),
      await fixture.store.get('versions', published.intake.version_id),
    );
    await upgraded.tx(async () => {
      await upgraded.remove('requests', cancelled.id);
      await upgraded.remove('scans', draft.scan_run_id);
      await upgraded.remove('versions', draft.version_id);
      await upgraded.remove('intakes', draft.id);
    });
    assert.equal(await upgraded.get('versions', draft.version_id), undefined);
    for (const intake of [published.intake, pending]) {
      await assert.rejects(() => upgraded.remove('versions', intake.version_id), /immutable/);
      await assert.rejects(() => upgraded.remove('scans', intake.scan_run_id), /immutable/);
    }
    for (const id of [published.request.id, request.id])
      await assert.rejects(() => upgraded.remove('requests', id), /immutable/);
    assert.deepEqual(new Set(await upgraded.all('audit')), new Set(snapshot.audit));
  } finally {
    await upgraded.close();
  }
}
