import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  hubMcpClientConfiguration,
  renderMcpClientConfiguration,
  type AgentClient,
} from '@capability-hub/contracts';

const endpoint = 'https://hub.example.test/mcp';
const cases: { client: AgentClient; path: string; config: unknown }[] = [
  {
    client: 'opencode',
    path: 'opencode.json',
    config: {
      mcp: {
        'capability-hub': {
          type: 'remote',
          url: endpoint,
          oauth: false,
          headers: { Authorization: 'Bearer {env:CAPABILITY_HUB_TOKEN}' },
        },
      },
    },
  },
  {
    client: 'pi',
    path: '.pi/mcp.json',
    config: {
      mcpServers: {
        'capability-hub': {
          url: endpoint,
          headers: { Authorization: 'Bearer ${CAPABILITY_HUB_TOKEN}' },
        },
      },
    },
  },
  {
    client: 'gemini-cli',
    path: '.gemini/settings.json',
    config: {
      mcpServers: {
        'capability-hub': {
          httpUrl: endpoint,
          headers: { Authorization: 'Bearer ${CAPABILITY_HUB_TOKEN}' },
        },
      },
    },
  },
  {
    client: 'vscode',
    path: '.vscode/mcp.json',
    config: {
      servers: {
        'capability-hub': {
          type: 'http',
          url: endpoint,
          headers: { Authorization: 'Bearer ${env:CAPABILITY_HUB_TOKEN}' },
        },
      },
    },
  },
  {
    client: 'copilot-cli',
    path: '.mcp.json',
    config: {
      mcpServers: {
        'capability-hub': {
          type: 'http',
          url: endpoint,
          tools: ['*'],
          headers: { Authorization: 'Bearer ${CAPABILITY_HUB_TOKEN}' },
        },
      },
    },
  },
];

for (const entry of cases) {
  test(`${entry.client} 的 Hub 配置使用官方结构、环境引用和项目位置`, () => {
    const actual = hubMcpClientConfiguration(entry.client, endpoint, 'project', 'token');
    assert.equal(actual.target_file, entry.path);
    assert.deepEqual(JSON.parse(actual.text), entry.config);
    assert.deepEqual(actual.config, entry.config);
  });
}

test('OpenCode stdio 保持参数边界并使用 environment，用户配置使用全局位置', () => {
  const result = renderMcpClientConfiguration(
    'opencode',
    'docs',
    {
      command: 'npx',
      args: ['-y', '@example/docs@1.2.3', '--project', 'my workspace'],
      env: { DOCS_TOKEN: '{env:DOCS_TOKEN}', MODE: 'readonly' },
    },
    'user',
  );
  assert.equal(result.target_file, '~/.config/opencode/opencode.json');
  assert.deepEqual(JSON.parse(result.text), {
    mcp: {
      docs: {
        type: 'local',
        command: ['npx', '-y', '@example/docs@1.2.3', '--project', 'my workspace'],
        environment: { DOCS_TOKEN: '{env:DOCS_TOKEN}', MODE: 'readonly' },
      },
    },
  });
});

test('普通 Header 保留 OpenCode 的 OAuth 探测，Authorization 才选择显式认证', () => {
  const ordinary = renderMcpClientConfiguration('opencode', 'docs', {
    url: endpoint,
    headers: { 'X-Region': 'cn' },
  });
  assert.equal(ordinary.config.mcp.docs.oauth, undefined);
  const authenticated = renderMcpClientConfiguration('opencode', 'docs', {
    url: endpoint,
    headers: { authorization: 'Bearer {env:TOKEN}' },
  });
  assert.equal(authenticated.config.mcp.docs.oauth, false);
});

test('Codex 的 TOML 引号和固定 Header 序列化不会产生额外配置项', () => {
  const result = renderMcpClientConfiguration('codex', 'docs', {
    url: endpoint,
    headers: { 'X-Label': 'line 1\n"line 2"' },
    env_http_headers: { 'X-Key': 'DOCS_KEY' },
  });
  const [section, ...fields] = result.text.split('\n');
  assert.equal(section, '[mcp_servers."docs"]');
  assert.deepEqual(
    fields.sort(),
    [
      'url = "https://hub.example.test/mcp"',
      'env_http_headers = { "X-Key" = "DOCS_KEY" }',
      'http_headers = { "X-Label" = "line 1\\n\\"line 2\\"" }',
    ].sort(),
  );
});

for (const client of [
  'codex',
  'claude-code',
  'cursor',
  'opencode',
  'pi',
  'gemini-cli',
  'vscode',
  'copilot-cli',
] as const) {
  test(`${client} 默认配置通过 OAuth 授权，不要求手动秘密变量`, () => {
    const actual = hubMcpClientConfiguration(client, endpoint);
    assert(actual.text.includes(endpoint));
    assert.equal(actual.text.includes('CAPABILITY_HUB_TOKEN'), false);
    assert.equal(actual.text.includes('Authorization'), false);
    assert.equal(actual.text.includes('"oauth": false'), false);
  });
}
