import '../support/dom.js';
import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { createElement, Suspense } from 'react';
import { PageBoundary } from '../../apps/web/src/app/PageBoundary.js';

// 模拟编译常量，先于读取它的网页模块载入。
Object.defineProperty(globalThis, '__HUB_WEB_BUILD__', { value: 'bundled-build' });
const { api } = await import('../../apps/web/src/shared/api/client.js');
const { WebUpdateNotice } = await import('../../apps/web/src/app/WebUpdateNotice.js');
const { lazyView, watchPreloadErrors } =
  await import('../../apps/web/src/shared/navigation/lazy-view.js');

afterEach(cleanup);

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
