import '../support/dom.js';
import assert from 'node:assert/strict';
import { afterEach, beforeEach, mock, test } from 'node:test';
import { createElement } from 'react';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { domWindow } from '../support/dom.js';
import {
  appearanceStorageKey,
  initializeAppearance,
  parseAppearance,
  readAppearance,
  themePalettes,
} from '../../apps/web/src/app/appearance.js';
import { ThemePicker } from '../../apps/web/src/app/ThemePicker.js';
import { useTheme } from '../../apps/web/src/app/theme.js';

function AppearanceControls() {
  return createElement(ThemePicker, useTheme());
}

beforeEach(() => {
  window.localStorage.removeItem(appearanceStorageKey);
  initializeAppearance();
});
afterEach(() => {
  cleanup();
  mock.restoreAll();
  window.localStorage.removeItem(appearanceStorageKey);
  initializeAppearance();
});

test('外观偏好只接受已注册配色和模式，损坏或缺失字段回到默认值', () => {
  for (const input of [null, 'null', '42', '[]', '{broken']) {
    assert.deepEqual(parseAppearance(input), { palette: 'graphite', mode: 'system' });
  }
  assert.deepEqual(parseAppearance('{"palette":"unknown","mode":"dark"}'), {
    palette: 'graphite',
    mode: 'dark',
  });
  window.localStorage.setItem(appearanceStorageKey, '{"palette":"sand","mode":"dark"}');
  initializeAppearance();
  assert.equal(document.documentElement.dataset.palette, 'sand');
  assert.equal(document.documentElement.dataset.theme, 'dark');
  assert(document.documentElement.classList.contains('dark'));
});

test('五套配色独立于明暗模式，支持键盘选择、关闭焦点恢复和刷新恢复', async () => {
  const user = userEvent.setup();
  const view = render(createElement(AppearanceControls));
  const trigger = screen.getByRole('button', { name: '外观设置' });
  await user.click(trigger);
  await user.click(screen.getByRole('radio', { name: '深色' }));
  for (const palette of themePalettes) {
    const option = screen.getByRole('radio', { name: palette.name });
    await user.click(option);
    assert.equal(document.documentElement.dataset.palette, palette.id);
    assert.equal(document.documentElement.dataset.theme, 'dark');
    assert.equal((option as HTMLInputElement).checked, true);
    assert.deepEqual(readAppearance(), { palette: palette.id, mode: 'dark' });
  }
  await user.keyboard('{ArrowUp}');
  assert.equal(document.documentElement.dataset.palette, 'sand');
  await user.click(screen.getByRole('radio', { name: '浅色' }));
  assert.equal(document.documentElement.dataset.palette, 'sand');
  assert(document.documentElement.classList.contains('light'));
  await user.keyboard('{Escape}');
  assert.equal(screen.queryByRole('dialog'), null);
  await waitFor(() => assert(document.activeElement === trigger));
  view.unmount();
  document.documentElement.removeAttribute('data-palette');
  initializeAppearance();
  render(createElement(AppearanceControls));
  await user.click(screen.getByRole('button', { name: '外观设置' }));
  assert.equal((screen.getByRole('radio', { name: '暖砂' }) as HTMLInputElement).checked, true);
  assert.equal((screen.getByRole('radio', { name: '浅色' }) as HTMLInputElement).checked, true);
});

test('其他标签页修改外观后同步，跟随系统不会留下固定明暗模式', async () => {
  const user = userEvent.setup();
  render(createElement(AppearanceControls));
  act(() => {
    window.dispatchEvent(
      new domWindow.StorageEvent('storage', {
        key: appearanceStorageKey,
        newValue: '{"palette":"forest","mode":"dark"}',
      }),
    );
  });
  await user.click(screen.getByRole('button', { name: '外观设置' }));
  assert.equal((screen.getByRole('radio', { name: '松绿' }) as HTMLInputElement).checked, true);
  await user.click(screen.getByRole('radio', { name: '跟随系统' }));
  assert.equal(document.documentElement.getAttribute('data-theme'), null);
  assert.equal(document.documentElement.dataset.palette, 'forest');
  assert.deepEqual(readAppearance(), { palette: 'forest', mode: 'system' });
});

test('浏览器禁用偏好存储时，仍可打开面板并切换本次外观', async () => {
  mock.method(domWindow.Storage.prototype, 'getItem', () => {
    throw new Error('blocked');
  });
  mock.method(domWindow.Storage.prototype, 'setItem', () => {
    throw new Error('blocked');
  });
  initializeAppearance();
  const user = userEvent.setup();
  render(createElement(AppearanceControls));
  await user.click(screen.getByRole('button', { name: '外观设置' }));
  await user.click(screen.getByRole('radio', { name: '海蓝' }));
  assert.equal(document.documentElement.dataset.palette, 'ocean');
});
