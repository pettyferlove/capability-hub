import '../support/dom.js';
import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { createElement } from 'react';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { cliInstallationGuide, hubTools } from '@capability-hub/contracts';
import ConnectPage from '../../apps/web/src/features/connect/ConnectPage.js';
import { HubToolbox } from '../../apps/web/src/features/connect/HubToolbox.js';
import { CliInstallationGuide } from '../../apps/web/src/shared/components/CliInstallationGuide.js';
import { HubCtx, type HubState } from '../../apps/web/src/shared/context/HubContext.js';

afterEach(cleanup);

test('CLI 安装可直接复制，仓库认证按需展开且不混入安装命令', async (context) => {
  const registry = 'https://registry.example/repository/npm/';
  context.mock.method(globalThis, 'fetch', async () =>
    Response.json(cliInstallationGuide('https://hub.example', registry)),
  );
  const user = userEvent.setup();
  render(createElement(CliInstallationGuide));
  const installation = within(await screen.findByRole('region', { name: '安装并验证 CLI' }));
  await user.click(installation.getByRole('button', { name: '复制' }));
  assert.equal(
    await navigator.clipboard.readText(),
    `npm install -g @capability-hub/cli --registry='${registry}' --@capability-hub:registry='${registry}'\ncapability-hub --cli-version`,
  );
  assert.equal(screen.queryByRole('region', { name: '配置 CLI 仓库' }), null);
  const authentication = screen.getByText('仓库需要认证时', { selector: 'summary' });
  const details = authentication.closest('details');
  assert(details);
  assert.equal(details.open, false);
  await user.click(authentication);
  assert.equal(details.open, true);
  await user.click(within(details).getByRole('button', { name: '复制' }));
  assert.equal(
    await navigator.clipboard.readText(),
    `npm login --scope=@capability-hub --registry='${registry}'`,
  );
});

test('未配置私有仓库时可直接复制 npm 安装命令，不要求获取仓库地址或认证', async (context) => {
  context.mock.method(globalThis, 'fetch', async () =>
    Response.json(cliInstallationGuide('https://hub.example')),
  );
  const user = userEvent.setup();
  render(createElement(CliInstallationGuide));
  const installation = within(await screen.findByRole('region', { name: '安装并验证 CLI' }));
  await user.click(installation.getByRole('button', { name: '复制' }));
  assert.equal(
    await navigator.clipboard.readText(),
    'npm install -g @capability-hub/cli\ncapability-hub --cli-version',
  );
  assert.equal(screen.queryByRole('region', { name: '配置 CLI 仓库' }), null);
  assert.equal(screen.queryByText(/请联系部署方获取安装方式/), null);
  assert.equal(screen.queryByText('获取 CLI 仓库地址'), null);
  assert.equal(screen.queryByText('仓库需要认证时'), null);
  const verification = within(screen.getByRole('region', { name: '验证 CLI 访问' }));
  await user.click(verification.getByRole('button', { name: '复制' }));
  assert.equal(
    await navigator.clipboard.readText(),
    "capability-hub search --url 'https://hub.example' --json --no-interactive",
  );
  const login = screen.getByText('首次使用或授权失效时登录 CLI', { selector: 'summary' });
  const details = login.closest('details');
  assert(details);
  assert.equal(details.open, false);
  await user.click(login);
  await user.click(within(details).getByRole('button', { name: '复制' }));
  assert.equal(
    await navigator.clipboard.readText(),
    "capability-hub login --url 'https://hub.example' --no-interactive",
  );
});

test('工具清单按需打开，按所需授权分组，关闭后可从原入口继续', async () => {
  const user = userEvent.setup();
  render(createElement(HubToolbox));
  const trigger = screen.getByRole('button', { name: '查看 MCP 工具' });
  assert.equal(screen.queryByText('search_skills'), null);
  await user.click(trigger);
  const sheet = within(await screen.findByRole('dialog', { name: 'Hub MCP 工具' }));
  const basic = within(sheet.getByRole('region', { name: '搜索和使用' }));
  const contribution = within(sheet.getByRole('region', { name: '分享、推荐与反馈' }));
  for (const tool of hubTools) {
    const group = tool.action === 'contribute' ? contribution : basic;
    assert(group.getByText(tool.name));
  }
  assert.equal(sheet.getAllByRole('listitem').length, hubTools.length);
  await user.keyboard('{Escape}');
  await waitFor(() => assert(!screen.queryByRole('dialog'), '工具清单应已关闭'));
  await waitFor(() => assert(document.activeElement === trigger, '关闭后应恢复到查看工具的按钮'));
});

test('接入页切换 Agent 后同时更新 MCP 配置、CLI 客户端和 Skill 目录', async (context) => {
  history.replaceState(null, '', '/connect');
  context.mock.method(globalThis, 'fetch', (path: string) => {
    if (path === '/api/hub-share')
      return Promise.resolve(
        Response.json({ installation_url: 'https://hub.example/INSTALL.md', prompt: 'test' }),
      );
    if (path === '/api/cli-installation')
      return Promise.resolve(Response.json(cliInstallationGuide('https://hub.example')));
    return Promise.resolve(Response.json([]));
  });
  const value: HubState = {
    me: {
      id: 'test-user',
      username: 'test-user',
      auth_provider: 'local',
      display_name: '测试用户',
      groups: [],
      capabilities: {
        can_ai: false,
        can_ai_console: false,
        can_admin: false,
        can_audit: false,
        can_publish: false,
        can_review: false,
      },
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
    assert(prompt.includes('https://hub.example/connect/cli'));
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
