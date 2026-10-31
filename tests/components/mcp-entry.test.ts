import '../support/dom.js';
import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { createElement, useState } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { McpEntryFields } from '../../apps/web/src/features/publishing/McpEntryFields.js';
import { emptyMcpEntry } from '../../apps/web/src/features/publishing/mcp-entry.js';

afterEach(cleanup);

test('HTTP MCP 地址显示友好提示并允许提交，HTTPS 不显示未加密提示', async () => {
  const user = userEvent.setup();
  let submissions = 0;
  function Form() {
    const [value, setValue] = useState(emptyMcpEntry);
    return createElement(
      'form',
      {
        onSubmit: (event) => {
          event.preventDefault();
          submissions++;
        },
      },
      createElement(McpEntryFields, { value, onChange: setValue }),
      createElement('button', { type: 'submit' }, '提交'),
    );
  }
  render(createElement(Form));
  const input = screen.getByRole('textbox', { name: 'MCP 服务地址' });
  assert(input instanceof HTMLInputElement);
  for (const address of ['http://10.0.0.8:8080/mcp', 'http://mcp.internal:8080/mcp']) {
    await user.clear(input);
    await user.type(input, address);
    await user.tab();
    assert(screen.getByText(/当前使用 HTTP，连接内容未经加密/));
    assert.equal(input.checkValidity(), true);
    assert.equal(input.getAttribute('aria-invalid'), null);
    await user.click(screen.getByRole('button', { name: '提交' }));
  }
  assert.equal(submissions, 2);
  await user.clear(input);
  await user.type(input, 'https://docs.example.test/mcp');
  assert.equal(screen.queryByText(/当前使用 HTTP，连接内容未经加密/), null);
  assert.equal(input.checkValidity(), true);
  await user.clear(input);
  await user.type(input, 'ftp://mcp.internal/mcp');
  await user.click(screen.getByRole('button', { name: '提交' }));
  assert.equal(input.checkValidity(), false);
  assert.equal(submissions, 2);
});
