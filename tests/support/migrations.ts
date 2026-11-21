import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { TestContext } from 'node:test';
import type { RecordStore } from '@capability-hub/application/ports';
import { catalogPromptStateId, type CatalogPromptStateRecord } from '@capability-hub/domain/models';
import type { createAiStore } from '@capability-hub/infrastructure/ai';
import { openRecordStore, type RecordStoreOptions } from '@capability-hub/infrastructure/store';
import { createTestHub, publishSkill, receiveSkill, submitPublication } from './application.js';
import { recoveryRuntime } from './ai-recovery.js';
import { createSqliteStore } from './store.js';

interface MigrationRuntime {
  directory: string;
  initialCount: number;
  open: typeof openRecordStore;
  ai: typeof createAiStore;
  openBefore(options: RecordStoreOptions, index: number): Promise<RecordStore>;
  append(sql: string): Promise<void>;
}

/** 在隔离的部署副本里追加迁移，验证真实执行器，不改工作区或当前数据库。 */
export async function migrationRuntime(
  context: TestContext,
  dialect: 'sqlite' | 'postgresql',
): Promise<MigrationRuntime> {
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
  };
  // AI 端口须由同一临时副本绑定，否则读不到副本内会话的 WeakMap。
  const ai = (await import(pathToFileURL(join(directory, 'src/ai.ts')).href)) as {
    createAiStore: typeof createAiStore;
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
    ai: ai.createAiStore,
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

/** 旧库只写用例所需的身份与发布记录，不要求尚未迁移的运行表存在。 */
async function seedPublicationHistory(target: RecordStore, source: RecordStore) {
  await target.tx(async () => {
    for (const table of [
      'users',
      'groups',
      'roles',
      'memberships',
      'role_bindings',
      'sources',
      'assets',
      'bindings',
      'versions',
      'intakes',
      'scans',
      'requests',
      'releases',
      'audit',
    ] as const) {
      for (const record of await source.all(table)) await target.insert(table, record);
    }
  });
}

/** 历史推荐按旧表结构直接写入，迁移结果通过当前 RecordStore 读取并校验。 */
export async function assertRecommendationMigration(
  context: TestContext,
  runtime: MigrationRuntime,
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
    await seedPublicationHistory(old, fixture.store);
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
  runtime: MigrationRuntime,
  options: RecordStoreOptions,
) {
  const fixture = await createTestHub(context);
  const published = await publishSkill(fixture);
  const draft = await receiveSkill(fixture, { slug: 'draft' });
  const cancelled = await submitPublication(fixture, draft);
  await fixture.hub.publications.cancel(fixture.admin, cancelled.id, { reason: '放弃发布' }, '"1"');
  const pending = await receiveSkill(fixture, { slug: 'pending' });
  const request = await submitPublication(fixture, pending);
  const old = await runtime.openBefore(options, 4);
  try {
    await seedPublicationHistory(old, fixture.store);
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
    assert.deepEqual(
      new Set(await upgraded.all('audit')),
      new Set(await fixture.store.all('audit')),
    );
  } finally {
    await upgraded.close();
  }
}

/** 有效的提示调度单例；仅含调度字段，批次为空。 */
export function catalogPromptState(nextRefreshAt: number): CatalogPromptStateRecord {
  return {
    id: catalogPromptStateId,
    next_refresh_at: nextRefreshAt,
    active_job_id: null,
    window: null,
    cursor: null,
    batches: [],
    updated_at: '2026-11-20T00:00:00.000Z',
  };
}

/** 从 0006 历史升级后提示表可用；单例约束由数据库执行，所以第二行经原始 SQL 写入。 */
export async function assertCatalogPromptMigration(
  runtime: MigrationRuntime,
  options: RecordStoreOptions,
  insertRaw: (id: string, data: string) => Promise<unknown>,
) {
  const old = await runtime.openBefore(options, 7);
  await old.close();
  const store = await runtime.open(options);
  try {
    assert.equal(await store.catalogPromptSchedule(), undefined);
    await store.insert('catalog_prompts', catalogPromptState(1_800_000_000_000));
    assert.deepEqual(await store.catalogPromptSchedule(), {
      next_refresh_at: 1_800_000_000_000,
      active_job_id: null,
    });
  } finally {
    await store.close();
  }
  const second = { ...catalogPromptState(1), id: 'other-prompts' };
  await assert.rejects(
    () => insertRaw(second.id, JSON.stringify(second)),
    options.driver === 'postgresql'
      ? { code: '23514', constraint: 'catalog_prompts_singleton' }
      : { message: /^CHECK constraint failed: catalog_prompts_singleton$/ },
  );
}

/** 回收索引应用于已有执行；等于截点即到期，同一时刻按 ID 截批，不误收队列运行项。 */
export async function assertExecutionExpiryMigration(
  context: TestContext,
  runtime: MigrationRuntime,
  options: RecordStoreOptions,
) {
  const template = recoveryRuntime((await createSqliteStore(context)).store).runtime;
  const base = await template.submit('expiry-owner', 'recoverable', { value: 1 });
  const through = base.payload.deadline;
  const old = await runtime.openBefore(options, 8);
  try {
    const ai = runtime.ai(old);
    await ai.tx(async () => {
      for (const kind of ['waiting_input', 'inline'] as const) {
        for (const [suffix, offset] of [
          ['b', 0],
          ['a', 0],
          ['z', -1],
          ['future', 1],
        ] as const) {
          const id = `${kind}-${suffix}`;
          await ai.insert('ai_executions', {
            ...base,
            id,
            execution_id: id,
            status: kind === 'inline' ? 'running' : 'waiting_input',
            payload: {
              ...base.payload,
              ...(kind === 'inline' && { execution_mode: 'inline' }),
              deadline: through + offset,
            },
          });
        }
      }
      await ai.insert('ai_executions', { ...base, status: 'running' });
    });
  } finally {
    await old.close();
  }
  const upgraded = await openRecordStore(options);
  try {
    const worker = recoveryRuntime(upgraded).runtime;
    for (const kind of ['waiting_input', 'inline'] as const)
      assert.deepEqual(await worker.store.listDueExecutionIds(kind, through, 2), [
        `${kind}-z`,
        `${kind}-a`,
      ]);
    context.mock.method(Date, 'now', () => through);
    await worker.expireDueExecutions();
    for (const kind of ['waiting_input', 'inline'] as const) {
      for (const suffix of ['z', 'a', 'b'])
        assert.equal((await worker.get(`${kind}-${suffix}`)).status, 'timed_out');
      assert.equal(
        (await worker.get(`${kind}-future`)).status,
        kind === 'inline' ? 'running' : 'waiting_input',
      );
    }
    assert.equal((await worker.get(base.id)).status, 'running');
  } finally {
    await upgraded.close();
  }
}
