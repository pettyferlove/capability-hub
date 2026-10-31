import '../support/dom.js';
import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { useSession } from '../../apps/web/src/app/use-session.js';
import { api, setCsrf } from '../../apps/web/src/shared/api/client.js';
import { deferred } from '../support/store.js';

afterEach(() => {
  cleanup();
  setCsrf('');
});

test('会话失效会取消正在读取的身份，迟到响应不能恢复登录或 CSRF', async (context) => {
  const identity = deferred<Response>();
  const calls: RequestInit[] = [];
  context.mock.method(globalThis, 'fetch', (path: string, options: RequestInit) => {
    calls.push(options);
    if (path === '/api/auth/status')
      return Promise.resolve(
        Response.json({
          initialized: true,
          setup_token_required: false,
          auth_provider: 'local',
          oidc_enabled: false,
        }),
      );
    if (path === '/api/me') return identity.promise;
    return Promise.resolve(new Response(null, { status: 204 }));
  });
  const hook = renderHook(() => useSession(0));
  await waitFor(() => assert.equal(calls.length, 2));
  act(() => {
    window.dispatchEvent(new Event('hub:unauthenticated'));
  });
  assert.equal(calls[1].signal?.aborted, true);
  await act(async () => {
    identity.resolve(Response.json({ id: 'late-user', csrf_token: 'late-token' }));
  });
  assert.equal(hook.result.current.me, null);
  assert.equal(hook.result.current.loading, false);
  await api('/api/test-write', { method: 'POST', body: '{}' });
  assert.equal(new Headers(calls[2].headers).get('X-CSRF-Token'), '');
});

test('API 写入保留调用方的幂等键、设置修订与 CSRF，表单文件让浏览器生成边界', async (context) => {
  const calls: RequestInit[] = [];
  context.mock.method(globalThis, 'fetch', (_path: string, options: RequestInit) => {
    calls.push(options);
    return Promise.resolve(new Response(null, { status: 204 }));
  });
  setCsrf('current-csrf');
  await api('/api/action', {
    method: 'POST',
    body: '{}',
    headers: { 'Idempotency-Key': 'explicit-key', 'If-Match': '"3"' },
  });
  const json = new Headers(calls[0].headers);
  assert.equal(json.get('Idempotency-Key'), 'explicit-key');
  assert.equal(json.get('If-Match'), '"3"');
  assert.equal(json.get('X-CSRF-Token'), 'current-csrf');
  assert.equal(json.get('Content-Type'), 'application/json');
  await api('/api/upload', { method: 'POST', body: new FormData() });
  assert.equal(new Headers(calls[1].headers).has('Content-Type'), false);
  assert.equal(calls[1].credentials, 'same-origin');
});
