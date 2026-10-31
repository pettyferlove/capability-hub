import type { TestContext } from 'node:test';
import { createServer } from 'node:http';
import { createTestHub, type TestHub } from './application.js';

export async function serveTestHub(context: TestContext) {
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
  const fixture = await createTestHub(context, { port: address.port, publicUrl: origin });
  state.fixture = fixture;
  return { ...fixture, origin };
}
