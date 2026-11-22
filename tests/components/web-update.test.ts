import '../support/dom.js';
import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { createElement, Suspense } from 'react';
import { PageBoundary } from '../../apps/web/src/app/PageBoundary.js';
import { navigate } from '../../apps/web/src/shared/navigation/history-navigation.js';
import { useAutoDismiss } from '../../apps/web/src/app/use-auto-dismiss.js';

// 模拟编译常量，先于读取它的网页模块载入。
Object.defineProperty(globalThis, '__HUB_WEB_BUILD__', { value: 'bundled-build' });
const { api } = await import('../../apps/web/src/shared/api/client.js');
const { WebUpdateNotice } = await import('../../apps/web/src/app/WebUpdateNotice.js');
const { default: App } = await import('../../apps/web/src/app/App.js');
const { lazyView, watchPreloadErrors } =
  await import('../../apps/web/src/shared/navigation/lazy-view.js');

afterEach(cleanup);

test('新版从受限页面进入登录表单时不要求确认更新', async (context) => {
  const { href } = location;
  const state: unknown = history.state;
  const key = 'capability-hub:confirmed-web-build';
  const previous = window.localStorage.getItem(key);
  context.after(() => {
    history.replaceState(state, '', href);
    if (previous === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, previous);
  });
  history.replaceState(null, '', '/account');
  window.localStorage.setItem(key, 'previous-build');
  context.mock.method(globalThis, 'fetch', async (path: string) => {
    if (path === '/api/auth/status') return Response.json({ initialized: true });
    if (path === '/api/me') return Response.json({}, { status: 401 });
    throw new Error('意外请求 ' + path);
  });

  render(createElement(App));
  assert(await screen.findByRole('form', { name: '本地登录' }));
  assert(!screen.queryByRole('region', { name: '版本更新' }), '登录表单上方不应出现版本横幅');
});

test('发现新构建时提示刷新，关闭后同一构建不再提示', async (context) => {
  let build = 'bundled-build';
  context.mock.method(globalThis, 'fetch', async () =>
    Response.json({}, { headers: { 'X-Capability-Hub-Web-Build': build } }),
  );
  const user = userEvent.setup();
  render(createElement(WebUpdateNotice));
  const query = () => act(async () => void (await api('/api/me')));
  await query();
  assert.equal(screen.queryByRole('status'), null);
  build = 'next-build';
  await query();
  const notice = within(screen.getByRole('region', { name: '版本更新' }));
  assert(notice.getByRole('status'));
  assert(notice.getByRole('button', { name: '刷新页面' }));
  await user.click(notice.getByRole('button', { name: '关闭版本提示' }));
  await query();
  assert.equal(screen.queryByRole('status'), null);
  build = 'another-build';
  await query();
  assert(screen.getByRole('status'));
});

test('切回旧标签页时无需业务请求就能发现新构建', async (context) => {
  let build = 'seen-in-background';
  let visibility: DocumentVisibilityState = 'hidden';
  context.mock.getter(document, 'visibilityState', () => visibility);
  context.mock.method(globalThis, 'fetch', async () =>
    Response.json({}, { headers: { 'X-Capability-Hub-Web-Build': build } }),
  );
  await api('/api/me');
  const user = userEvent.setup();
  render(createElement(WebUpdateNotice));
  await user.click(screen.getByRole('button', { name: '关闭版本提示' }));

  build = 'deployed-while-away';
  const changeVisibility = () =>
    act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
  await changeVisibility();
  assert.equal(screen.queryByRole('region', { name: '版本更新' }), null);
  visibility = 'visible';
  await changeVisibility();
  assert(screen.getByRole('button', { name: '刷新页面' }));
});

test('旧 chunk 失败时只对新版重载一次，之后沿用错误边界', async (context) => {
  let build: string;
  context.mock.method(
    globalThis,
    'fetch',
    async () => new Response(null, { headers: { 'X-Capability-Hub-Web-Build': build } }),
  );
  context.after(() => window.sessionStorage.clear());
  let reloads = 0;
  for (const [servedBuild, reloading, totalReloads] of [
    ['bundled-build', false, 0],
    ['replacement-build', true, 1],
    ['replacement-build', false, 1],
  ] as const) {
    build = servedBuild;
    const unwatch = watchPreloadErrors(() => {
      reloads++;
    });
    const View = lazyView(async () => {
      const error = new Error('missing route chunk');
      window.dispatchEvent(Object.assign(new Event('vite:preloadError'), { payload: error }));
      throw error;
    });
    try {
      render(
        createElement(PageBoundary, null, createElement(Suspense, null, createElement(View))),
        {
          onCaughtError: () => {},
        },
      );
      await screen.findByRole(reloading ? 'status' : 'alert');
      assert.equal(screen.queryByRole(reloading ? 'alert' : 'status'), null);
      assert.equal(reloads, totalReloads);
    } finally {
      unwatch?.();
      cleanup();
    }
  }
});

test('打开刷新菜单不重载，选中立即刷新才重载', async (context) => {
  context.mock.method(globalThis, 'fetch', async () =>
    Response.json({}, { headers: { 'X-Capability-Hub-Web-Build': 'refresh-options-build' } }),
  );
  await api('/api/me');
  const user = userEvent.setup();
  let reloads = 0;
  render(
    createElement(WebUpdateNotice, {
      onReload: () => {
        reloads++;
      },
    }),
  );
  await user.click(screen.getByRole('button', { name: '刷新页面' }));
  const immediate = await screen.findByRole('menuitem', { name: '立即刷新' });
  assert.equal(reloads, 0);
  await user.click(immediate);
  assert.equal(reloads, 1);
});

async function startCountdown() {
  await act(async () => {
    fireEvent.keyDown(screen.getByRole('button', { name: '刷新页面' }), { key: 'ArrowDown' });
  });
  fireEvent.click(screen.getByRole('menuitem', { name: '10 秒后刷新' }));
}

test('倒计时只在主动启动后生效，取消后重新计时才会刷新', async (context) => {
  context.mock.method(globalThis, 'fetch', async () =>
    Response.json({}, { headers: { 'X-Capability-Hub-Web-Build': 'countdown-build' } }),
  );
  await api('/api/me');
  const { timers } = context.mock;
  timers.enable({ apis: ['Date', 'setTimeout'], now: 0 });
  context.mock.method(performance, 'now', () => Date.now());
  let reloads = 0;
  render(
    createElement(WebUpdateNotice, {
      onReload: () => {
        reloads++;
      },
    }),
  );
  const advance = (milliseconds: number) => act(() => timers.tick(milliseconds));
  advance(10_000);
  assert.equal(reloads, 0);

  await startCountdown();
  advance(2_500);
  const running = within(screen.getByRole('button', { name: '取消刷新' }));
  assert(running.getByText('08s'));
  fireEvent.click(screen.getByRole('button', { name: '取消刷新' }));
  assert.equal(document.activeElement, screen.getByRole('button', { name: '刷新页面' }));
  advance(10_000);
  assert.equal(reloads, 0);

  await startCountdown();
  advance(9_999);
  assert.equal(reloads, 0);
  advance(1);
  assert.equal(reloads, 1);
  advance(10_000);
  assert.equal(reloads, 1);
});

test('切换页面、新构建或关闭提示都会撤销当前倒计时', async (context) => {
  const { href } = location;
  const state: unknown = history.state;
  context.after(() => history.replaceState(state, '', href));
  let build = 'countdown-original';
  context.mock.method(globalThis, 'fetch', async () =>
    Response.json({}, { headers: { 'X-Capability-Hub-Web-Build': build } }),
  );
  await api('/api/me');
  const { timers } = context.mock;
  timers.enable({ apis: ['Date', 'setTimeout'], now: 0 });
  context.mock.method(performance, 'now', () => Date.now());
  let reloads = 0;
  render(
    createElement(WebUpdateNotice, {
      onReload: () => {
        reloads++;
      },
    }),
  );
  await startCountdown();
  act(() => navigate('/connect', { replace: true }));
  assert.equal(screen.queryByRole('button', { name: '取消刷新' }), null);

  await startCountdown();
  build = 'countdown-replacement';
  await act(async () => void (await api('/api/me')));
  assert.equal(screen.queryByRole('button', { name: '取消刷新' }), null);

  await startCountdown();
  fireEvent.click(screen.getByRole('button', { name: '关闭版本提示' }));
  assert.equal(screen.queryByRole('region', { name: '版本更新' }), null);
  act(() => timers.tick(10_000));
  assert.equal(reloads, 0);
});

function AutoDismissNotice({ onDismiss }: { onDismiss: () => void }) {
  const { holdProps } = useAutoDismiss(true, 10, onDismiss);
  return createElement('div', holdProps, createElement('button', { type: 'button' }, '知道了'));
}

test('自动关闭只在页面可见时计时，悬停或聚焦时暂停并按剩余时间继续', async (context) => {
  let visibility: DocumentVisibilityState = 'hidden';
  context.mock.getter(document, 'visibilityState', () => visibility);
  const { timers } = context.mock;
  timers.enable({ apis: ['Date', 'setTimeout'], now: 0 });
  context.mock.method(performance, 'now', () => Date.now());
  const advance = (milliseconds: number) => act(() => timers.tick(milliseconds));
  const button = () => screen.getByRole('button', { name: '知道了' });
  // user-event 靠 setTimeout 排空任务，模拟计时器下会挂起，这里直接派发指针与焦点事件。
  const holds: Array<[hold: () => unknown, release: () => unknown]> = [
    [
      () => fireEvent.pointerOver(button(), { pointerType: 'mouse' }),
      () => fireEvent.pointerOut(button(), { pointerType: 'mouse' }),
    ],
    [() => act(() => button().focus()), () => act(() => button().blur())],
  ];
  for (const [hold, release] of holds) {
    visibility = 'hidden';
    let dismissals = 0;
    render(
      createElement(AutoDismissNotice, {
        onDismiss: () => {
          dismissals++;
        },
      }),
    );
    advance(30_000);
    visibility = 'visible';
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    advance(6_000);
    await hold();
    advance(30_000);
    await release();
    advance(3_999);
    assert.equal(dismissals, 0);
    advance(1);
    assert.equal(dismissals, 1);
    cleanup();
  }
});
