import '../support/dom.js';
import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { createElement } from 'react';
import { cleanup, render, screen, within } from '@testing-library/react';
import { ReviewStatusTabs } from '../../apps/web/src/features/review/ReviewStatusTabs.js';

afterEach(cleanup);

test('审核状态保留真实导航链接，零条记录正常显示，切换时不沿用上次计数', () => {
  const view = render(createElement(ReviewStatusTabs, { state: 'approved', count: 0 }));
  const navigation = screen.getByRole('navigation', { name: '审核状态' });
  const links = within(navigation).getAllByRole('link');
  assert.deepEqual(
    links.map((link) => link.getAttribute('href')),
    [
      '/review',
      '/review?state=approved',
      '/review?state=rejected',
      '/review?state=stale',
      '/review?state=cancelled',
    ],
  );
  assert.equal(links.filter((link) => link.getAttribute('aria-current') === 'page').length, 1);
  assert.equal(links[1].getAttribute('aria-current'), 'page');
  assert.equal(within(links[1]).getByLabelText('0 条记录').textContent, '0');

  view.rerender(createElement(ReviewStatusTabs, { state: 'cancelled' }));
  assert.equal(links[1].getAttribute('aria-current'), null);
  assert.equal(links[4].getAttribute('aria-current'), 'page');
  assert.equal(screen.queryByLabelText('0 条记录'), null);
  assert.equal(within(links[4]).getByLabelText('记录数暂不可用').textContent, '—');
  view.rerender(createElement(ReviewStatusTabs, { state: 'cancelled', count: 12 }));
  assert.equal(within(links[4]).getByLabelText('12 条记录').textContent, '12');
});
