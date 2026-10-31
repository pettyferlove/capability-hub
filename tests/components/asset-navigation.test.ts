import '../support/dom.js';
import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { createElement, useState } from 'react';
import { cleanup, render, screen, fireEvent, act } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { useAppRoute } from '../../apps/web/src/app/use-app-route.js';
import { appRoute, closeAsset } from '../../apps/web/src/shared/navigation/history-navigation.js';

afterEach(() => {
  cleanup();
  window.history.replaceState(null, '', '/discover');
});

function Background() {
  const [filter, setFilter] = useState('');
  return createElement(
    'div',
    null,
    createElement('input', {
      'aria-label': '资产筛选',
      value: filter,
      onChange: (event) => setFilter(event.currentTarget.value),
    }),
    createElement('a', { href: '/asset/example?tab=feedback' }, '查看详情'),
  );
}
function NavigationFixture() {
  const route = useAppRoute();
  return createElement(
    'main',
    null,
    createElement('output', null, route.page + '?' + route.query),
    createElement(Background, { key: route.page }),
    route.asset && createElement('button', { onClick: closeAsset }, '关闭详情'),
  );
}

test('维护页打开详情保留页面与筛选，历史导航恢复正确入口', async () => {
  window.history.replaceState(null, '', '/publish?tab=manage');
  render(createElement(NavigationFixture));
  const user = userEvent.setup();
  await user.type(screen.getByRole('textbox'), 'example');
  fireEvent.click(screen.getByRole('link', { name: '查看详情' }));
  assert.equal(window.location.pathname, '/asset/example');
  assert(screen.getByText('publish?tab=manage'));
  assert.equal((screen.getByRole('textbox') as HTMLInputElement).value, 'example');
  const detailState: unknown = window.history.state;
  act(() => {
    window.history.replaceState(null, '', '/publish?tab=manage');
    window.dispatchEvent(new Event('popstate'));
  });
  assert.equal(screen.queryByRole('button', { name: '关闭详情' }), null);
  assert.equal((screen.getByRole('textbox') as HTMLInputElement).value, 'example');
  act(() => {
    window.history.replaceState(detailState, '', '/asset/example?tab=feedback');
    window.dispatchEvent(new Event('popstate'));
  });
  assert(screen.getByRole('button', { name: '关闭详情' }));
  assert(screen.getByText('publish?tab=manage'));
});

test('直接详情链接与不可信来源状态均使用发现页，关闭不离开站点', async () => {
  assert.equal(
    appRoute('/asset/example', '', { asset_background: '//external.test' }).page,
    'discover',
  );
  assert.equal(
    appRoute('/asset/example', '', { asset_background: '/api/assets' }).page,
    'discover',
  );
  assert.equal(
    appRoute('/asset/example', '', { asset_background: '/asset/other' }).page,
    'discover',
  );
  window.history.replaceState(null, '', '/asset/example');
  render(createElement(NavigationFixture));
  fireEvent.click(screen.getByRole('button', { name: '关闭详情' }));
  assert.equal(window.location.pathname, '/discover');
});
