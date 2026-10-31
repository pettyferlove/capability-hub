import '../support/dom.js';
import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { createElement } from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { ShareHubButton } from '../../apps/web/src/features/connect/ShareHubButton.js';

afterEach(cleanup);

const invitation = {
  installation_url: 'https://public-hub.example.test/INSTALL.md',
  prompt:
    '请帮我将这个 Capability Hub 接入当前使用的 Agent：\nhttps://public-hub.example.test/INSTALL.md',
};

test('分享弹窗无需选择客户端，复制公开邀请并在关闭后恢复焦点', async (context) => {
  history.replaceState(null, '', '/connect?client=cursor&code=PRIVATE');
  const fetch = context.mock.method(globalThis, 'fetch', () =>
    Promise.resolve(Response.json(invitation)),
  );
  const user = userEvent.setup();
  render(createElement(ShareHubButton));
  const trigger = screen.getByRole('button', { name: '分享 Hub' });
  assert.equal(fetch.mock.callCount(), 0);
  await user.click(trigger);
  assert(screen.getByRole('dialog', { name: '分享 Hub' }));
  await user.click(await screen.findByRole('button', { name: '复制邀请' }));
  assert.equal(await navigator.clipboard.readText(), invitation.prompt);
  assert.equal(screen.queryByRole('combobox'), null);
  assert.equal(screen.queryByRole('button', { name: /Agent 客户端/ }), null);
  assert.equal(
    screen.getByRole('link', { name: '查看公开接入说明' }).getAttribute('href'),
    invitation.installation_url,
  );
  assert(screen.getByRole('status').textContent?.includes('已复制'));
  await user.keyboard('{Escape}');
  await waitFor(() => assert.equal(screen.queryByRole('dialog'), null));
  // 焦点恢复发生在下一帧；不要在等待期间序列化整个 jsdom 元素树。
  await waitFor(() => assert(document.activeElement === trigger, '关闭后应恢复到分享按钮'));
  await user.click(trigger);
  await screen.findByRole('button', { name: '复制邀请' });
  await user.click(screen.getByRole('button', { name: '关闭' }));
  await waitFor(() => assert.equal(screen.queryByRole('dialog'), null));
});

test('邀请加载失败可重试，响应无效时不提供复制入口', async (context) => {
  let response: unknown = { installation_url: 'invalid', prompt: '' };
  context.mock.method(globalThis, 'fetch', () => Promise.resolve(Response.json(response)));
  const user = userEvent.setup();
  render(createElement(ShareHubButton));
  await user.click(screen.getByRole('button', { name: '分享 Hub' }));
  assert(await screen.findByText('邀请暂时不可用，请重新加载'));
  assert.equal(screen.queryByRole('button', { name: '复制邀请' }), null);
  response = invitation;
  await user.click(screen.getByRole('button', { name: '重新加载' }));
  await user.click(await screen.findByRole('button', { name: '复制邀请' }));
  assert.equal(await navigator.clipboard.readText(), invitation.prompt);
});
