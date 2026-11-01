import type { TestContext } from 'node:test';
import { createServer } from 'node:http';
import { createTestHub, type TestHub } from './application.js';
import type { ServerConfig } from '@capability-hub/server/config';

/**
 * 起真实 TCP 监听，并把 `publicUrl`/`port` 指向它——需要真实 URL 的场景（OAuth 回调、
 * CLI 接入、设备码轮询）必须用这个而不是内存版 {@link createTestHub}。
 * 监听先于 fixture 创建，之前到达的请求返回 503；`context.after` 负责关服务。
 */
export async function serveTestHub(context: TestContext, overrides: Partial<ServerConfig> = {}) {
  const state: { fixture?: TestHub } = {};
  const server = createServer((req, res) => {
    if (state.fixture) state.fixture.app(req, res);
    else {
      res.statusCode = 503;
      res.end();
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  context.after(
    () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  );
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected a TCP server');
  const origin = `http://127.0.0.1:${address.port}`;
  const fixture = await createTestHub(context, {
    ...overrides,
    port: address.port,
    publicUrl: origin,
  });
  state.fixture = fixture;
  return { ...fixture, origin };
}
