import '../support/dom.js';
import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { createElement } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import ConnectPage from '../../apps/web/src/features/connect/ConnectPage.js';
import { HubCtx, type HubState } from '../../apps/web/src/shared/context/HubContext.js';

afterEach(cleanup);

test('接入页切换 Agent 后同时更新 MCP 配置、CLI 客户端和 Skill 目录', async (context) => {
  history.replaceState(null, '', '/connect');
  context.mock.method(globalThis, 'fetch', (path: string) => {
    if (path === '/api/hub-share')
      return Promise.resolve(
        Response.json({ installation_url: 'https://hub.example/INSTALL.md', prompt: 'test' }),
      );
    return Promise.resolve(Response.json([]));
  });
  const value: HubState = {
    me: {
      id: 'test-user',
      username: 'test-user',
      display_name: '测试用户',
      groups: [],
      capabilities: { can_admin: false, can_audit: false, can_publish: false, can_review: false },
      features: { git_hosts: [] },
      csrf_token: 'test-only-csrf',
    },
    reviewCount: 0,
    refresh: 0,
    reload: () => {},
    openPalette: () => {},
    logout: async () => {},
  };
  const user = userEvent.setup();
  const { container } = render(
    createElement(HubCtx.Provider, { value }, createElement(ConnectPage)),
  );
  for (const [label, id, path, directory, reference] of [
    ['OpenCode', 'opencode', 'opencode.json', '.opencode/skills', '{env:CAPABILITY_HUB_TOKEN}'],
    ['Pi', 'pi', '.pi/mcp.json', '.agents/skills', '${CAPABILITY_HUB_TOKEN}'],
    [
      'Gemini CLI',
      'gemini-cli',
      '.gemini/settings.json',
      '.gemini/skills',
      '${CAPABILITY_HUB_TOKEN}',
    ],
    ['VS Code', 'vscode', '.vscode/mcp.json', '.github/skills', '${env:CAPABILITY_HUB_TOKEN}'],
    ['GitHub Copilot CLI', 'copilot-cli', '.mcp.json', '.github/skills', '${CAPABILITY_HUB_TOKEN}'],
  ]) {
    await user.click(await screen.findByRole('button', { name: /Agent 客户端/ }));
    await user.click(screen.getByRole('option', { name: label }));
    assert(await screen.findByText(path, { exact: true }));
    const code = [...container.querySelectorAll('pre')].map((node) => node.textContent).join('\n');
    assert(code.includes(`--client ${id} --option`));
    assert(code.includes(`--to ${directory} --dry-run`));
    assert(code.includes(reference));
    assert(screen.getByRole('link', { name: '官方接入文档' }));
    await user.click(screen.getByRole('button', { name: '复制 Hub 接入指令' }));
    const prompt = await navigator.clipboard.readText();
    assert(prompt.includes(`请为 ${label} 接入 Capability Hub MCP`));
    assert.equal(prompt.includes('CAPABILITY_HUB_TOKEN'), false);
    assert(prompt.includes('OAuth'));
    assert(prompt.includes(path));
    assert.equal(prompt.includes('test-only-csrf'), false);
    assert.equal(
      screen.getByRole('link', { name: '查看对话接入说明' }).getAttribute('href'),
      `/connect/mcp?client=${id}&scope=project`,
    );
  }
  await user.click(screen.getByRole('button', { name: /MCP 配置范围/ }));
  await user.click(screen.getByRole('option', { name: '我的所有项目' }));
  await user.click(await screen.findByRole('button', { name: '复制 Hub 接入指令' }));
  const userPrompt = await navigator.clipboard.readText();
  assert(userPrompt.includes('当前用户'));
  assert(userPrompt.includes('~/.copilot/mcp-config.json'));
  assert.equal(
    screen.getByRole('link', { name: '查看对话接入说明' }).getAttribute('href'),
    '/connect/mcp?client=copilot-cli&scope=user',
  );
});
