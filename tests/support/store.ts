import type { TestContext } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openRecordStore } from '@capability-hub/infrastructure/store';

/**
 * 临时目录里的 SQLite 记录存储，`context.after` 里先关库再删目录（顺序反了会删掉仍在写的文件）。
 * 返回的 `path` 可用来开第二个连接或传给子进程。
 */
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

/**
 * 手动控制的可等待信号：把 resolve/reject 暴露给测试，用来卡住流式响应或等待请求已到达
 * 这类进程内事件。fixture 服务靠它实现 gated 流与断连观测，因此不要在断言通过前提前 resolve。
 */
export function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((accept, decline) => {
    resolve = accept;
    reject = decline;
  });
  return { promise, resolve, reject };
}
