import '../support/dom.js';
import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { createElement, useState } from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { SafeMarkdown } from '../../apps/web/src/shared/components/SafeMarkdown.js';
import { KeywordField } from '../../apps/web/src/shared/components/KeywordField.js';

afterEach(cleanup);

test('Markdown 不挂载 HTML 或远程图片，固定快照引用只触发文件导航', async () => {
  const opened: [string, string | undefined][] = [];
  const user = userEvent.setup();
  const { container } = render(
    createElement(SafeMarkdown, {
      text: '# 标题\n\n<script>alert(1)</script>\n\n![远程图片](https://example.test/tracker.png)\n\n[参考](docs/guide.md#示例) [外链](https://example.test/docs) [危险](javascript:alert%281%29)',
      currentFile: 'SKILL.md',
      paths: ['SKILL.md', 'docs/guide.md'],
      onOpen: (path, anchor) => opened.push([path, anchor]),
    }),
  );
  assert.equal(container.querySelector('script'), null);
  assert.equal(container.querySelector('img'), null);
  await user.click(screen.getByRole('button', { name: '参考' }));
  assert.deepEqual(opened, [['docs/guide.md', '示例']]);
  const external = screen.getByRole('link', { name: '外链' });
  assert.equal(external.getAttribute('target'), '_blank');
  assert.equal(external.getAttribute('rel'), 'noreferrer noopener');
  assert.equal(screen.getByText('危险').hasAttribute('href'), false);
});

test('关键词输入去重、保留未按回车的末项，并通过退格与删除按钮更新表单值', async () => {
  const user = userEvent.setup();
  function Form() {
    const [value, setValue] = useState<string[]>([]);
    return createElement(
      'div',
      null,
      createElement(KeywordField, { value, onChange: setValue }),
      createElement('output', { 'aria-label': '提交值' }, JSON.stringify(value)),
    );
  }
  render(createElement(Form));
  const input = screen.getByRole('combobox', { name: /检索关键词/ });
  await user.type(input, 'TypeScript,typescript;React');
  assert.equal(screen.getByLabelText('提交值').textContent, '["TypeScript","React"]');
  await user.keyboard('{Enter}{Backspace}');
  assert.equal(screen.getByLabelText('提交值').textContent, '["TypeScript"]');
  await user.click(screen.getByRole('button', { name: '移除关键词 TypeScript' }));
  assert.equal(screen.getByLabelText('提交值').textContent, '[]');
});

test('输入法组合期间的原生 keyCode 229 回车不提交关键词', async () => {
  const user = userEvent.setup();
  function Form() {
    const [value, setValue] = useState<string[]>([]);
    return createElement(
      'div',
      null,
      createElement(KeywordField, { value, onChange: setValue }),
      createElement('output', { 'aria-label': '提交值' }, JSON.stringify(value)),
    );
  }
  render(createElement(Form));
  const input = screen.getByRole('combobox', { name: /检索关键词/ }) as HTMLInputElement;
  await user.type(input, 'Rust');
  // Chrome 在组合期间把 key 报成 Unidentified，回车确认候选词的信号只有原生 keyCode 229。
  const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
  Object.defineProperty(enter, 'keyCode', { value: 229 });
  act(() => {
    input.dispatchEvent(enter);
  });
  assert.equal(input.value, 'Rust');
  assert.equal(enter.defaultPrevented, false);
  assert.equal(screen.queryByRole('button', { name: '移除关键词 Rust' }), null);
});
