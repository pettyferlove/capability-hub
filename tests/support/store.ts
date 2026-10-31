import type { TestContext } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openRecordStore } from '@capability-hub/infrastructure/store';

export async function createSqliteStore(context: TestContext) {
  const directory = await mkdtemp(join(tmpdir(), 'hub-store-test-'));
  const path = join(directory, 'hub.sqlite');
  const store = await openRecordStore({ driver: 'sqlite', path });
  context.after(async () => {
    try {
      await store.close();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
  return { store, path, directory };
}

export function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((accept, decline) => {
    resolve = accept;
    reject = decline;
  });
  return { promise, resolve, reject };
}
