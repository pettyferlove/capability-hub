import '../support/dom.js';
import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { createElement, useState } from 'react';
import { cleanup, render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { McpEntryFields } from '../../apps/web/src/features/publishing/McpEntryFields.js';
import { McpSharedKeysForm } from '../../apps/web/src/features/catalog/McpSharedKeysForm.js';
import {
  buildMcpDocument,
  emptyMcpEntry,
  sharedKeyForUpload,
  type McpEntryDraft,
} from '../../apps/web/src/features/publishing/mcp-entry.js';

afterEach(cleanup);

for (const [configured, scheme] of [
  [false, 'bearer'],
  [true, undefined],
] as const) {
  const action = configured ? '替换' : '保存';
  test(`维护者${action}共享凭据时必须再次确认，取消保留输入`, async (context) => {
    const target = {
      url: 'https://example.test/mcp',
      name: scheme ? 'Authorization' : 'X-Api-Key',
      scheme,
    };
    const saved: unknown[] = [];
    context.mock.method(globalThis, 'fetch', async (_path: string, options: RequestInit) => {
      if (options.method !== 'PUT')
        return Response.json({ revision: 3, targets: [{ ...target, configured }] });
      assert.equal(new Headers(options.headers).get('If-Match'), '"3"');
      saved.push(JSON.parse(String(options.body)));
      return Response.json({ revision: 4 });
    });
    const user = userEvent.setup();
    render(
      createElement(McpSharedKeysForm, {
        assetId: 'asset',
        assetSlug: 'sample-service',
        onSaved: () => {},
      }),
    );
    const field = await screen.findByLabelText(scheme ? /共享 Bearer Token/ : /替换共享 API Key/);
    const token = 'synthetic-value';
    await user.type(field, token);
    const submit = screen.getByRole('button', { name: '保存共享凭据' });
    await user.click(submit);
    const dialog = screen.getByRole('dialog', {
      name: configured ? '确认替换共享凭据' : '确认共享凭据',
    });
    assert(within(dialog).getByText(/版本公开时，任何已登录用户都可以领取/));
    assert(within(dialog).getByText(target.url));
    assert(!dialog.textContent?.includes(token));
    assert.equal(saved.length, 0);
    await user.click(within(dialog).getByRole('button', { name: '取消' }));
    assert(field instanceof HTMLInputElement && field.value === token);
    assert.equal(saved.length, 0);
    await user.click(submit);
    await user.click(screen.getByRole('button', { name: '确认' + action + '共享凭据' }));
    assert.deepEqual(saved, [
      {
        url: target.url,
        name: target.name,
        ...(scheme ? { scheme } : {}),
        value: token,
        confirm_sharing: true,
      },
    ]);
  });
}

function EntryForm({ onSubmit }: { onSubmit: (draft: McpEntryDraft) => void }) {
  const [value, setValue] = useState(emptyMcpEntry);
  return createElement(
    'form',
    {
      onSubmit: (event) => {
        event.preventDefault();
        onSubmit(value);
      },
    },
    createElement(McpEntryFields, { value, onChange: setValue }),
    createElement('button', { type: 'submit' }, '提交'),
  );
}

test('HTTP MCP 地址显示友好提示并允许提交，HTTPS 不显示未加密提示', async () => {
  const user = userEvent.setup();
  let submissions = 0;
  render(createElement(EntryForm, { onSubmit: () => submissions++ }));
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

test('API Key 表单只提交所选请求头的环境变量引用', async () => {
  const user = userEvent.setup();
  const address = 'http://gateway.example.test/mcp';
  const submissions: McpEntryDraft[] = [];
  render(createElement(EntryForm, { onSubmit: (draft) => submissions.push(draft) }));
  await user.type(screen.getByRole('textbox', { name: 'MCP 服务地址' }), address);
  await user.click(screen.getByRole('radio', { name: 'API Key' }));
  await user.click(screen.getByRole('radio', { name: '使用者自备' }));
  const header = screen.getByRole('textbox', { name: '请求头名称' });
  const variable = screen.getByRole('textbox', { name: /密钥环境变量名/ });
  const submit = screen.getByRole('button', { name: '提交' });
  await user.clear(header);
  await user.type(header, 'X-Key: value');
  await user.click(submit);
  assert.equal(submissions.length, 0);
  await user.clear(header);
  await user.type(header, 'X-Gateway-Key');
  await user.clear(variable);
  await user.type(variable, 'GATEWAY_KEY=value');
  await user.click(submit);
  assert.equal(submissions.length, 0);
  await user.clear(variable);
  await user.type(variable, 'GATEWAY_KEY');
  await user.click(submit);
  await user.click(screen.getByRole('radio', { name: '无需认证' }));
  await user.click(submit);
  const remote = { type: 'streamable-http', url: address };
  const remotes = submissions.map((draft) => {
    const document = buildMcpDocument({ ...draft, description: '内网网关' }, 'gateway', '1.0.0');
    assert('remotes' in document);
    return document.remotes;
  });
  assert.deepEqual(remotes, [
    [
      {
        ...remote,
        headers: [
          {
            name: 'X-Gateway-Key',
            value: '{GATEWAY_KEY}',
            isRequired: true,
            isSecret: true,
            variables: { GATEWAY_KEY: { isSecret: true } },
          },
        ],
      },
    ],
    [remote],
  ]);
});

test('Hub 共享密钥与描述预览分开，修改服务地址后需要重新录入', async () => {
  const user = userEvent.setup();
  const drafts: McpEntryDraft[] = [];
  render(createElement(EntryForm, { onSubmit: (draft) => drafts.push(draft) }));
  const address = screen.getByRole('textbox', { name: 'MCP 服务地址' });
  await user.type(address, 'https://example.test/mcp');
  await user.click(screen.getByRole('radio', { name: 'API Key' }));
  const key = screen.getByLabelText(/共享 API Key/);
  assert(key instanceof HTMLInputElement && key.type === 'password');
  assert.equal(screen.queryByRole('textbox', { name: /密钥环境变量名/ }), null);
  await user.type(key, 'example-secret-value');
  await user.click(screen.getByRole('button', { name: '提交' }));
  assert.equal(sharedKeyForUpload(drafts[0]), 'example-secret-value');
  const preview = buildMcpDocument({ ...drafts[0], description: '服务' }, 'sample-mcp', '1.0.0');
  assert(!JSON.stringify(preview).includes('example-secret-value'));
  await user.type(address, '/v2');
  assert.equal(key.value, '');
  await user.click(screen.getByRole('button', { name: '提交' }));
  assert.equal(drafts.length, 1);
});
