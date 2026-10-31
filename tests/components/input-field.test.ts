import '../support/dom.js';
import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { createElement, createRef } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { renderToStaticMarkup } from 'react-dom/server';
import { InputField } from '../../apps/web/src/shared/components/InputField.js';
import { PasswordField } from '../../apps/web/src/shared/components/PasswordField.js';
import { formStackStyles } from '../../apps/web/src/shared/styles/recipes.js';
import { domWindow } from '../support/dom.js';

afterEach(cleanup);

test('图标前缀保留原生标签、ref、输入事件、校验与表单值', async () => {
  const ref = createRef<HTMLInputElement>();
  let lastValue = '';
  const user = userEvent.setup();
  render(
    createElement(
      'form',
      { 'aria-label': '资料', className: formStackStyles },
      createElement(
        'label',
        null,
        '联系邮箱',
        createElement(InputField, {
          icon: 'mail',
          name: 'email',
          type: 'email',
          required: true,
          ref,
          onChange: (event) => {
            lastValue = event.target.value;
          },
        }),
      ),
      createElement(
        'label',
        null,
        '只读名称',
        createElement(InputField, {
          icon: 'user',
          name: 'name',
          defaultValue: 'Alice',
          readOnly: true,
        }),
      ),
      createElement(
        'label',
        null,
        '禁用字段',
        createElement(InputField, {
          icon: 'tag',
          name: 'disabled',
          defaultValue: 'excluded',
          disabled: true,
        }),
      ),
    ),
  );
  const input = screen.getByRole('textbox', { name: '联系邮箱' });
  assert(ref.current === input);
  assert.equal(ref.current.checkValidity(), false);
  await user.click(screen.getByText('联系邮箱'));
  assert(document.activeElement === input);
  await user.type(input, 'alice@example.com');
  assert.equal(lastValue, 'alice@example.com');
  assert.equal(ref.current.checkValidity(), true);
  await user.type(screen.getByRole('textbox', { name: '只读名称' }), 'ignored');
  const form = screen.getByRole('form', { name: '资料' });
  assert(form instanceof HTMLFormElement);
  const data = new domWindow.FormData(form);
  assert.equal(data.get('email'), 'alice@example.com');
  assert.equal(data.get('name'), 'Alice');
  assert.equal(data.has('disabled'), false);
  assert.equal(form.querySelectorAll('svg[aria-hidden="true"][focusable="false"]').length, 3);
});

test('密码前缀不影响显示隐藏与已输入内容，图标无需等待网络即可渲染', async () => {
  const html = renderToStaticMarkup(createElement(InputField, { icon: 'lock', name: 'password' }));
  assert.match(html, /<svg/);
  const user = userEvent.setup();
  const { container } = render(
    createElement(
      'form',
      { className: formStackStyles },
      createElement(PasswordField, { name: 'password', label: '密码' }),
    ),
  );
  const input = container.querySelector('input');
  assert(input);
  await user.type(input, 'test-password-123');
  await user.click(screen.getByRole('button', { name: '显示密码' }));
  assert.equal(input.type, 'text');
  assert.equal(input.value, 'test-password-123');
  await user.click(screen.getByRole('button', { name: '隐藏密码' }));
  assert.equal(input.type, 'password');
  assert.equal(input.value, 'test-password-123');
  assert.equal(input.minLength, 12);
});
