import '../support/dom.js';
import assert from 'node:assert/strict';
import { test, afterEach } from 'node:test';
import { createElement } from 'react';
import { render, screen, cleanup, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { ConnectionAuthorization } from '../../apps/web/src/features/connect/ConnectionAuthorization.js';
import ConnectPage from '../../apps/web/src/features/connect/ConnectPage.js';
import { ConnectedAgents } from '../../apps/web/src/features/profile/ConnectedAgents.js';
import { HubCtx, type HubState } from '../../apps/web/src/shared/context/HubContext.js';
import { deferred } from '../support/store.js';

afterEach(cleanup);
const state: HubState = {
  me: {
    id: 'user',
    username: 'reader',
    auth_provider: 'local',
    display_name: '读者',
    groups: [],
    capabilities: {
      can_ai: false,
      can_ai_console: false,
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

function authorizationResponse(expiresAt = Date.now() + 60000) {
  return Response.json({
    client_name: '我的 Agent',
    redirect_origin: 'http://127.0.0.1:1234',
    resource: 'https://hub.example/mcp',
    scope: 'hub:contribute',
    expires_at: expiresAt,
  });
}

function renderAuthorization() {
  return render(
    createElement(
      HubCtx.Provider,
      { value: state },
      createElement(ConnectionAuthorization, { requestId: 'request' }),
    ),
  );
}

test('授权页默认只允许读取，贡献权限需用户选择，失败后可取消且不展示令牌表单', async (context) => {
  const requests: unknown[] = [];
  const cancellation = deferred<Response>();
  context.mock.method(globalThis, 'fetch', (_path: string, init: RequestInit) => {
    if (init.method === 'POST') {
      const decision = JSON.parse(String(init.body)) as { allow: boolean };
      requests.push(decision);
      if (!decision.allow) return cancellation.promise;
      return Promise.resolve(
        Response.json(
          { error: { code: 'INTERNAL_ERROR', message: '服务暂时无法完成请求' } },
          { status: 503 },
        ),
      );
    }
    return Promise.resolve(authorizationResponse());
  });
  const user = userEvent.setup();
  renderAuthorization();
  await screen.findByText('我的 Agent');
  assert.equal((screen.getByRole('checkbox') as HTMLInputElement).checked, false);
  assert.equal(screen.queryByRole('textbox', { name: '令牌名称' }), null);
  await user.click(screen.getByRole('button', { name: '允许连接' }));
  await screen.findByText('服务暂时无法完成请求');
  assert.deepEqual(requests[0], { allow: true, contribute: false });
  await user.click(screen.getByRole('checkbox'));
  await user.click(screen.getByRole('button', { name: '允许连接' }));
  await screen.findByText('服务暂时无法完成请求');
  assert.deepEqual(requests[1], { allow: true, contribute: true });
  await user.click(screen.getByRole('button', { name: '取消' }));
  assert.deepEqual(requests[2], { allow: false, contribute: true });
  assert.equal(screen.getByRole('button', { name: '正在取消…' }).getAttribute('aria-busy'), 'true');
  assert.equal(
    (screen.getByRole('button', { name: '允许连接' }) as HTMLButtonElement).disabled,
    true,
  );
  cancellation.resolve(Response.json({ error: { message: '取消失败' } }, { status: 400 }));
  await screen.findByText('取消失败');
});

test('连接列表按客户端区分读取和贡献权限，断开操作只针对所选的有效连接', async (context) => {
  const disconnected: string[] = [];
  const read = {
    id: 'read',
    name: 'Claude Code',
    scope: 'hub:read',
    created_at: 1,
    last_used_at: null,
    revoked_at: null,
  };
  context.mock.method(globalThis, 'fetch', (path: string, init: RequestInit) => {
    if (init.method === 'DELETE') {
      disconnected.push(path);
      return Promise.resolve(new Response(null, { status: 204 }));
    }
    return Promise.resolve(
      Response.json([
        { ...read, revoked_at: disconnected.length ? 4 : null },
        {
          ...read,
          id: 'contribute',
          name: 'oh-my-pi',
          scope: 'hub:contribute',
          created_at: 2,
          last_used_at: 3,
        },
        { ...read, id: 'revoked', name: '旧连接', revoked_at: 4 },
      ]),
    );
  });
  const user = userEvent.setup();
  const { rerender } = render(
    createElement(HubCtx.Provider, { value: state }, createElement(ConnectedAgents)),
  );
  const table = await screen.findByRole('table', { name: 'Agent 连接' });
  const [, contributor, reader] = within(table).getAllByRole('row');
  assert.equal(screen.getByRole('status').textContent, '2 条记录');
  assert.equal(screen.queryByRole('link', { name: '追加分享、推荐与反馈权限' }), null);
  assert(screen.getByText('--contribute'));
  assert.equal(within(table).queryByText('旧连接'), null);
  assert(within(contributor).getByText('oh-my-pi'));
  assert(within(contributor).getByText('搜索和使用'));
  assert(within(contributor).getByText('分享、推荐与反馈'));
  assert(within(reader).getByText('等待首次访问'));
  assert.equal(within(reader).queryByText('分享、推荐与反馈'), null);
  await user.click(within(reader).getByRole('button', { name: '断开 Claude Code 的连接' }));
  assert.deepEqual(disconnected, ['/api/connections/read']);
  rerender(
    createElement(
      HubCtx.Provider,
      { value: { ...state, refresh: 1 } },
      createElement(ConnectedAgents),
    ),
  );
  await screen.findByText('1 条记录');
  assert.equal(screen.queryByText('--contribute'), null);
});

test('需要贡献权限时会显示可用桥接命令并保留客户端管理的用户范围', async (context) => {
  history.replaceState(null, '', '/connect?client=vscode&scope=user&permission=contribute');
  context.mock.method(globalThis, 'fetch', () =>
    Promise.resolve(
      Response.json({ installation_url: 'https://hub.example/INSTALL.md', prompt: 'test' }),
    ),
  );
  const user = userEvent.setup();
  render(
    createElement(HubCtx.Provider, { value: { ...state, me: null } }, createElement(ConnectPage)),
  );
  const methods = within(await screen.findByRole('group', { name: '连接方式' }));
  assert(methods.getByRole('button', { pressed: true }).textContent?.includes('接入助手'));
  assert((methods.getByRole('button', { pressed: false }) as HTMLButtonElement).disabled);
  await user.click(screen.getByRole('button', { name: '复制 Hub 接入指令' }));
  const prompt = await navigator.clipboard.readText();
  assert(prompt.includes('--scope user --contribute --config-file ""'));
  assert(prompt.includes('MCP: Open User Configuration'));
});

for (const query of ['authorization=opaque-request', 'code=A1B2C3D4']) {
  test(`未登录的授权入口 ${query} 保留本次请求，隐藏普通接入表单，登录后能继续`, () => {
    const target = '/connect?' + query;
    history.replaceState(null, '', target);
    render(
      createElement(HubCtx.Provider, { value: { ...state, me: null } }, createElement(ConnectPage)),
    );
    assert.equal(
      screen.getByRole('link', { name: '登录并继续' }).getAttribute('href'),
      '/login?return_to=' + encodeURIComponent(target),
    );
    assert.equal(screen.queryByRole('button', { name: '复制 Hub 接入指令' }), null);
  });
}

test('CLI 授权只提交有效授权码，提交期间锁定操作，成功后更换链接可开始新的授权', async (context) => {
  const pending = deferred<Response>();
  const requests: unknown[] = [];
  context.mock.method(globalThis, 'fetch', (path: string, init: RequestInit) => {
    requests.push({ path, method: init.method, body: JSON.parse(String(init.body)) as unknown });
    return pending.promise;
  });
  const user = userEvent.setup();
  const renderPage = (code: string) =>
    createElement(
      HubCtx.Provider,
      { value: state },
      createElement(ConnectPage, { routeQuery: '?code=' + code }),
    );
  const { rerender } = render(renderPage('a1b2c3d4'));
  const input = screen.getByRole('textbox', { name: '授权码' }) as HTMLInputElement;
  assert.equal(input.value, 'A1B2C3D4');
  assert(screen.getByText('读者'));
  assert(screen.getByText('只读权限'));
  await user.clear(input);
  await user.type(input, 'Z1B2C3D4');
  assert((screen.getByRole('button', { name: '允许 CLI 登录' }) as HTMLButtonElement).disabled);
  await user.keyboard('{Enter}');
  assert.equal(requests.length, 0);
  await user.clear(input);
  await user.type(input, 'a1b2c3d4{Enter}');
  assert.deepEqual(requests, [
    { path: '/api/cli/approve', method: 'POST', body: { code: 'A1B2C3D4' } },
  ]);
  assert(input.disabled);
  assert.equal(screen.getByRole('button', { name: '正在批准…' }).getAttribute('aria-busy'), 'true');
  assert((screen.getByRole('button', { name: '暂不登录' }) as HTMLButtonElement).disabled);
  pending.resolve(Response.json({ ok: true }));
  await screen.findByRole('heading', { name: 'CLI 登录已批准' });
  assert.equal(screen.queryByRole('button', { name: '允许 CLI 登录' }), null);
  assert.equal(
    screen.getByRole('link', { name: '前往账号安全' }).getAttribute('href'),
    '/account?tab=security',
  );
  rerender(renderPage('F1E2D3C4'));
  assert.equal(
    (screen.getByRole('textbox', { name: '授权码' }) as HTMLInputElement).value,
    'F1E2D3C4',
  );
  assert.equal(screen.queryByRole('heading', { name: 'CLI 登录已批准' }), null);
});

test('CLI 临时批准失败保留授权码可重试，授权码失效后结束审批并提示从终端重新发起', async (context) => {
  let expired = false;
  context.mock.method(globalThis, 'fetch', async () =>
    expired
      ? Response.json(
          { error: { code: 'CLI_LOGIN_EXPIRED', message: 'CLI 授权码无效或过期' } },
          { status: 400 },
        )
      : Response.json(
          { error: { code: 'INTERNAL_ERROR', message: '服务暂不可用' } },
          { status: 503 },
        ),
  );
  const user = userEvent.setup();
  render(
    createElement(
      HubCtx.Provider,
      { value: state },
      createElement(ConnectPage, { routeQuery: '?code=A1B2C3D4' }),
    ),
  );
  await user.click(screen.getByRole('button', { name: '允许 CLI 登录' }));
  await screen.findByText('服务暂不可用');
  assert.equal(
    (screen.getByRole('textbox', { name: '授权码' }) as HTMLInputElement).value,
    'A1B2C3D4',
  );
  expired = true;
  await user.click(screen.getByRole('button', { name: '允许 CLI 登录' }));
  await screen.findByRole('heading', { name: '授权码无效或已过期' });
  assert(screen.getByText(/请在终端重新发起 CLI 登录/));
  assert.equal(screen.queryByRole('textbox', { name: '授权码' }), null);
  assert.equal(screen.queryByRole('button', { name: '允许 CLI 登录' }), null);
  assert.equal(screen.getByRole('link', { name: '返回接入指引' }).getAttribute('href'), '/connect');
});

const invalidGrant = () =>
  Response.json({ error: { code: 'INVALID_GRANT', message: '授权已失效' } }, { status: 400 });

for (const [reason, response] of [
  ['本地已过期', () => authorizationResponse(Date.now() - 1000)],
  ['服务端已拒绝', invalidGrant],
] as const) {
  test(`${reason}的授权链接隐藏批准操作，并引导用户重新连接或查看已有授权`, async (context) => {
    context.mock.method(globalThis, 'fetch', async () => response());
    renderAuthorization();
    await screen.findByRole('heading', { name: '授权链接已失效' });
    assert(screen.getByText(/回到发起请求的 Agent 或终端/));
    assert.equal(
      screen.getByRole('link', { name: '查看已授权的 Agent' }).getAttribute('href'),
      '/account?tab=security',
    );
    assert.equal(screen.queryByRole('button', { name: '重新加载' }), null);
    assert.equal(screen.queryByRole('button', { name: '允许连接' }), null);
  });
}

test('读取失败可以重试，审批时发现链接已使用则结束授权', async (context) => {
  let available = false;
  context.mock.method(globalThis, 'fetch', async (_path: string, init: RequestInit) => {
    if (init.method === 'POST') return invalidGrant();
    return available
      ? authorizationResponse()
      : Response.json({ error: { message: '服务暂不可用' } }, { status: 503 });
  });
  const user = userEvent.setup();
  renderAuthorization();
  await screen.findByText('服务暂不可用');
  available = true;
  await user.click(screen.getByRole('button', { name: '重新加载' }));
  await user.click(await screen.findByRole('button', { name: '允许连接' }));
  await screen.findByRole('heading', { name: '授权链接已失效' });
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
