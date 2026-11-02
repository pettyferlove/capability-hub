import '../support/dom.js';
import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { createElement } from 'react';
import { act, cleanup, render, renderHook, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { installBrowserLogging } from '@capability-hub/logging/browser';
import LoginPage from '../../apps/web/src/features/auth/LoginPage.js';
import { useSession } from '../../apps/web/src/app/use-session.js';
import { api, setCsrf } from '../../apps/web/src/shared/api/client.js';
import { deferred } from '../support/store.js';

afterEach(() => {
  cleanup();
  setCsrf('');
});

test('内网 HTTP 浏览器缺少 randomUUID 时仍能启动日志并发起写请求', async (context) => {
  const getRandomValues = crypto.getRandomValues.bind(crypto);
  context.mock.getter(globalThis, 'crypto', () => ({ getRandomValues }));
  const logging = installBrowserLogging();
  context.after(() => logging.dispose());
  const keys: string[] = [];
  context.mock.method(globalThis, 'fetch', (_path: string, options: RequestInit) => {
    keys.push(new Headers(options.headers).get('Idempotency-Key') ?? '');
    return Promise.resolve(Response.json({ ok: true }));
  });
  await api('/auth/login', { method: 'POST' });
  await api('/auth/logout', { method: 'POST' });
  assert.equal(new Set(keys).size, 2);
  for (const key of keys)
    assert.match(key, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test('切换登录方式清空上一组凭据和错误，只提交当前选择的来源', async (context) => {
  const submitted: unknown[] = [];
  context.mock.method(globalThis, 'fetch', (_path: string, options: RequestInit) => {
    submitted.push(JSON.parse(String(options.body)));
    return Promise.resolve(
      Response.json({ error: { message: '账号或密码错误' } }, { status: 401 }),
    );
  });
  const user = userEvent.setup();
  render(
    createElement(LoginPage, { initialized: true, ldapEnabled: true, onLogin: async () => {} }),
  );
  assert.equal(
    screen.getByRole('radio', { name: '本地账号' }).getAttribute('aria-checked'),
    'true',
  );
  await user.type(screen.getByRole('textbox', { name: '账号' }), 'same-name');
  await user.type(screen.getByLabelText('密码', { exact: true }), 'local-secret');
  await user.click(screen.getByRole('button', { name: '登录本地账号' }));
  assert(await screen.findByText('账号或密码错误'));
  await user.click(screen.getByRole('radio', { name: 'LDAP 账号' }));
  assert.equal(screen.queryByText('账号或密码错误'), null);
  const username = screen.getByRole<HTMLInputElement>('textbox', { name: '账号' });
  const password = screen.getByLabelText<HTMLInputElement>('密码', { exact: true });
  assert.equal(username.value, '');
  assert.equal(password.value, '');
  await user.type(username, 'same-name');
  await user.type(password, 'directory-secret');
  await user.click(screen.getByRole('button', { name: '登录 LDAP 账号' }));
  assert(await screen.findByText('账号或密码错误'));
  assert.deepEqual(submitted, [
    { provider: 'local', username: 'same-name', password: 'local-secret' },
    { provider: 'ldap', username: 'same-name', password: 'directory-secret' },
  ]);
});

test('初始化和未启用 LDAP 的实例只显示本地表单', () => {
  const onLogin = async () => {};
  const page = render(createElement(LoginPage, { initialized: false, ldapEnabled: true, onLogin }));
  assert.equal(screen.queryByRole('radiogroup', { name: '登录方式' }), null);
  assert(screen.getByRole('form', { name: '初始化' }));
  page.rerender(createElement(LoginPage, { initialized: true, ldapEnabled: false, onLogin }));
  assert.equal(screen.queryByRole('radiogroup', { name: '登录方式' }), null);
  assert(screen.getByRole('form', { name: '本地登录' }));
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
          auth_provider: 'native-rbac',
          ldap_enabled: false,
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
