import '../support/dom.js';
import assert from 'node:assert/strict';
import { test, afterEach } from 'node:test';
import { createElement } from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { ConnectionAuthorization } from '../../apps/web/src/features/connect/ConnectionAuthorization.js';
import ConnectPage from '../../apps/web/src/features/connect/ConnectPage.js';
import { HubCtx, type HubState } from '../../apps/web/src/shared/context/HubContext.js';

afterEach(cleanup);
const state: HubState = {
  me: {
    id: 'user',
    username: 'reader',
    display_name: '读者',
    groups: [],
    capabilities: {
      can_ai: false,
      can_admin: false,
      can_audit: false,
      can_publish: false,
      can_review: false,
    },
    features: { git_hosts: [] },
    csrf_token: 'test-csrf',
  },
  refresh: 0,
  reviewCount: 0,
  reload: () => {},
  openPalette: () => {},
  logout: async () => {},
};

test('授权页默认只允许读取，贡献权限需用户选择，失败后可取消且不展示令牌表单', async (context) => {
  const requests: unknown[] = [];
  context.mock.method(globalThis, 'fetch', (_path: string, init: RequestInit) => {
    if (init.method === 'POST') {
      requests.push(JSON.parse(String(init.body)));
      return Promise.resolve(
        Response.json({ error: { message: '授权请求已过期，请重新连接' } }, { status: 400 }),
      );
    }
    return Promise.resolve(
      Response.json({
        client_name: '我的 Agent',
        redirect_origin: 'http://127.0.0.1:1234',
        resource: 'https://hub.example/mcp',
        scope: 'hub:contribute',
        expires_at: Date.now() + 60000,
      }),
    );
  });
  const user = userEvent.setup();
  render(
    createElement(
      HubCtx.Provider,
      { value: state },
      createElement(ConnectionAuthorization, { requestId: 'request' }),
    ),
  );
  await screen.findByText('我的 Agent');
  assert.equal((screen.getByRole('checkbox') as HTMLInputElement).checked, false);
  assert.equal(screen.queryByRole('textbox', { name: '令牌名称' }), null);
  await user.click(screen.getByRole('button', { name: '允许连接' }));
  await screen.findByText('授权请求已过期，请重新连接');
  assert.deepEqual(requests[0], { allow: true, contribute: false });
  await user.click(screen.getByRole('checkbox'));
  await user.click(screen.getByRole('button', { name: '允许连接' }));
  await screen.findByText('授权请求已过期，请重新连接');
  assert.deepEqual(requests[1], { allow: true, contribute: true });
  await user.click(screen.getByRole('button', { name: '取消' }));
  assert.deepEqual(requests[2], { allow: false, contribute: true });
});

test('未登录的授权入口保留本次请求，隐藏普通接入表单，登录后能继续', () => {
  history.replaceState(null, '', '/connect?authorization=opaque-request');
  render(
    createElement(HubCtx.Provider, { value: { ...state, me: null } }, createElement(ConnectPage)),
  );
  assert.equal(
    screen.getByRole('link', { name: '登录并继续' }).getAttribute('href'),
    '/login?return_to=%2Fconnect%3Fauthorization%3Dopaque-request',
  );
  assert.equal(screen.queryByRole('button', { name: '复制 Hub 接入指令' }), null);
});

test('已过期的授权隐藏批准操作并提示返回 Agent 重新发起', async (context) => {
  context.mock.method(globalThis, 'fetch', () =>
    Promise.resolve(
      Response.json({
        client_name: 'expired',
        redirect_origin: 'http://127.0.0.1:1234',
        resource: 'https://hub.example/mcp',
        scope: 'hub:read',
        expires_at: Date.now() - 1000,
      }),
    ),
  );
  render(
    createElement(
      HubCtx.Provider,
      { value: state },
      createElement(ConnectionAuthorization, { requestId: 'expired' }),
    ),
  );
  await screen.findByText(/授权请求已过期，请返回 Agent/);
  assert.equal(screen.queryByRole('button', { name: '允许连接' }), null);
});

test('登录后的接入页恢复客户端、范围、贡献权限与手动入口', async (context) => {
  history.replaceState(
    null,
    '',
    '/connect?client=cursor&scope=user&method=token&permission=contribute',
  );
  context.mock.method(globalThis, 'fetch', () =>
    Promise.resolve(
      Response.json({ installation_url: 'https://hub.example/INSTALL.md', prompt: 'test' }),
    ),
  );
  const { container } = render(
    createElement(HubCtx.Provider, { value: { ...state, me: null } }, createElement(ConnectPage)),
  );
  const login = await screen.findByRole('link', { name: '登录并创建手动令牌' });
  const target = new URL(login.getAttribute('href')!, location.origin).searchParams.get(
    'return_to',
  );
  assert.equal(target, '/connect?client=cursor&scope=user&method=token&permission=contribute');
  assert.equal((screen.getByRole('checkbox') as HTMLInputElement).checked, true);
  const summary = screen.getByText('高级手动接入 · 访问令牌');
  assert.equal(summary.closest('details')?.open, true);
  assert(container.textContent?.includes('~/.cursor/mcp.json'));
});
