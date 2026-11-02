import '../support/dom.js';
import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { createElement, useState, type ReactNode } from 'react';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { PersonalSecurity } from '../../apps/web/src/features/profile/SecurityPanel.js';
import { AccessTokenForm } from '../../apps/web/src/features/profile/AccessTokenForm.js';
import { HubCtx } from '../../apps/web/src/shared/context/HubContext.js';
import type { MeResponse } from '@capability-hub/contracts/http';
import { deferred } from '../support/store.js';

afterEach(cleanup);

function Provider({ children, me = null }: { children: ReactNode; me?: MeResponse | null }) {
  const [refresh, setRefresh] = useState(0);
  return createElement(
    HubCtx.Provider,
    {
      value: {
        me,
        reviewCount: 0,
        refresh,
        reload: () => setRefresh((value) => value + 1),
        openPalette: () => {},
        logout: async () => {},
      },
    },
    children,
  );
}

test('LDAP 账号安全页指向目录改密，保留 Hub 会话与令牌入口', async (context) => {
  context.mock.method(globalThis, 'fetch', () => Promise.resolve(Response.json([])));
  const me: MeResponse = {
    id: 'directory-user',
    username: 'member',
    display_name: '目录成员',
    auth_provider: 'ldap',
    groups: [],
    csrf_token: 'test-csrf',
    features: { git_hosts: [] },
    capabilities: {
      can_ai: false,
      can_ai_console: false,
      can_admin: false,
      can_audit: false,
      can_publish: false,
      can_review: false,
    },
  };
  render(createElement(Provider, { me, children: createElement(PersonalSecurity) }));
  assert(await screen.findByText('请在 LDAP 目录中修改账号密码。'));
  assert.equal(screen.queryByLabelText('当前密码'), null);
  assert(screen.getByRole('heading', { name: '登录会话' }));
  assert(await screen.findByRole('button', { name: '创建访问令牌' }));
});

test('安全设置原位创建、复制和刷新列表，关闭后不再回显令牌', async (context) => {
  history.replaceState(null, '', '/account?tab=security');
  const user = userEvent.setup();
  const issued = deferred<Response>();
  const requests: unknown[] = [];
  const record = {
    id: 'token-1',
    name: '工作电脑',
    scope: 'hub:contribute',
    created_at: '2026-10-30T00:00:00Z',
    revoked_at: null,
  };
  let created = false;
  context.mock.method(globalThis, 'fetch', (path: string, options: RequestInit) => {
    if (path === '/api/me/sessions' || path === '/api/connections')
      return Promise.resolve(Response.json([]));
    assert.equal(path, '/api/tokens');
    if (options.method === 'POST') {
      requests.push(JSON.parse(String(options.body)));
      return issued.promise;
    }
    return Promise.resolve(Response.json(created ? [record] : []));
  });
  render(createElement(Provider, null, createElement(PersonalSecurity)));
  await screen.findByText(/尚未创建访问令牌/);
  await user.click(screen.getByRole('button', { name: '创建访问令牌' }));
  const dialog = within(screen.getByRole('dialog', { name: '创建访问令牌' }));
  assert.equal(
    dialog.getByRole('radio', { name: '读取与使用' }).getAttribute('aria-checked'),
    'true',
  );
  await user.type(dialog.getByRole('textbox', { name: '令牌名称' }), '工作电脑');
  await user.click(dialog.getByRole('radio', { name: '读取、分享、推荐与反馈' }));
  await user.click(dialog.getByRole('button', { name: '生成令牌' }));
  await user.click(dialog.getByRole('button', { name: '生成令牌' }));
  await user.click(dialog.getByRole('button', { name: '关闭' }));
  assert(screen.getByRole('dialog'));
  assert.deepEqual(requests, [{ name: '工作电脑', scope: 'hub:contribute' }]);
  await act(async () => {
    created = true;
    issued.resolve(Response.json({ token: 'test-only-token-secret' }));
  });
  await screen.findByText('工作电脑');
  assert(dialog.getByText('test-only-token-secret'));
  await user.click(dialog.getByRole('button', { name: '复制' }));
  assert.equal(await navigator.clipboard.readText(), 'test-only-token-secret');
  assert.equal(location.pathname + location.search, '/account?tab=security');
  await user.click(dialog.getByRole('button', { name: '我已安全保存，隐藏令牌' }));
  await waitFor(() => assert.equal(screen.queryByRole('dialog'), null));
  await user.click(screen.getByRole('button', { name: '创建访问令牌' }));
  assert.equal(screen.queryByText('test-only-token-secret'), null);
  await user.click(screen.getByRole('button', { name: '取消' }));
  await waitFor(() => assert.equal(screen.queryByRole('dialog'), null));
  assert.equal(requests.length, 1);
});

test('令牌创建拒绝空白名称，失败后保留输入并允许重试', async (context) => {
  const user = userEvent.setup();
  let attempts = 0;
  context.mock.method(globalThis, 'fetch', () => {
    attempts++;
    return Promise.resolve(
      attempts === 1
        ? Response.json({ error: { message: '创建失败，请重试' } }, { status: 503 })
        : Response.json({ token: 'retry-token-secret' }),
    );
  });
  render(createElement(Provider, null, createElement(AccessTokenForm)));
  const name = screen.getByRole('textbox', { name: '令牌名称' });
  await user.type(name, '   ');
  await user.click(screen.getByRole('button', { name: '生成令牌' }));
  assert.equal(attempts, 0);
  assert(screen.getByRole('alert'));
  await user.clear(name);
  await user.type(name, 'CLI');
  await user.click(screen.getByRole('button', { name: '生成令牌' }));
  await screen.findByText('创建失败，请重试');
  assert(name instanceof HTMLInputElement);
  assert.equal(name.value, 'CLI');
  await user.click(screen.getByRole('button', { name: '生成令牌' }));
  await screen.findByText('retry-token-secret');
  assert.equal(attempts, 2);
  assert.equal(screen.queryByRole('alert'), null);
});
