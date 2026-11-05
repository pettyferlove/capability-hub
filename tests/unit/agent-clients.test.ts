import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
import {
  hubMcpClientConfiguration,
  hubMcpConnectionGuide,
  hubShareInvitation,
  hubInstallationGuide,
  renderMcpClientConfiguration,
  cliInstallationGuide,
  type AgentClient,
} from '@capability-hub/contracts';

const endpoint = 'https://hub.example.test/mcp';

test('CLI 仓库命令保留完整路径和参数边界，地址中的 Shell 表达式不会执行', () => {
  const registry = "https://registry.example/repository/npm'$(printf injected)/";
  const guide = cliInstallationGuide(endpoint, registry);
  const commands = guide.steps.flatMap((step) => step.command?.split('\n') ?? []);
  for (const [prefix, expected] of [
    [
      'npm install',
      [
        'install',
        '-g',
        '@capability-hub/cli',
        `--registry=${registry}`,
        `--@capability-hub:registry=${registry}`,
      ],
    ],
    ['npm login', ['login', '--scope=@capability-hub', `--registry=${registry}`]],
  ] as const) {
    const command = commands.find((value) => value.startsWith(prefix));
    assert(command);
    const output = execFileSync('sh', ['-c', `npm() { printf '%s\\n' "$@"; }\n${command}`], {
      encoding: 'utf8',
    });
    assert.deepEqual(output.trimEnd().split('\n'), expected);
  }
});

test('两条接入说明的 CLI 查询都绑定当前实例，保留参数边界且无需客户端标识', () => {
  for (const origin of [
    'https://hub.example.test/start?token=must-not-reflect',
    'http://127.0.0.1:4100/',
    "https://hub'$(printf).example.test/",
  ]) {
    const descriptions = [
      hubInstallationGuide(origin),
      cliInstallationGuide(origin)
        .steps.map((step) => step.command ?? '')
        .join('\n'),
    ];
    for (const description of descriptions) {
      const command = description
        .split('\n')
        .find((line) => line.startsWith('capability-hub search '));
      assert(command);
      const output = execFileSync(
        'sh',
        [
          '-c',
          `capture() { printf '%s\\n' "$@"; }\n${command.replace(/^capability-hub /, 'capture ')}`,
        ],
        { encoding: 'utf8' },
      );
      assert.deepEqual(output.trimEnd().split('\n'), [
        'search',
        '--url',
        new URL(origin).origin,
        '--json',
        '--no-interactive',
      ]);
    }
  }
});

test('本机和远程地址的分享邀请只包含接入请求和实例链接', () => {
  for (const hostname of ['127.0.0.1', 'hub.example.test']) {
    const invite = hubShareInvitation(`http://${hostname}:4100/?token=private`);
    assert.equal(
      invite.prompt,
      `请按照以下安装指南，为当前 Agent 配置 Capability Hub：\nhttp://${hostname}:4100/INSTALL.md`,
    );
  }
});

test('OAuth 适配区分读取和贡献范围，无法表达范围时交付可申请贡献权限的助手配置', () => {
  for (const client of [
    'codex',
    'opencode',
    'pi',
    'gemini-cli',
    'cursor',
    'claude-code',
    'vscode',
    'copilot-cli',
  ] as const) {
    for (const permission of ['read', 'contribute'] as const) {
      const scopes = permission === 'read' ? ['hub:read'] : ['hub:read', 'hub:contribute'];
      const guide = hubMcpConnectionGuide(client, endpoint, 'user', 'oauth', permission);
      const service = Object.values(guide.config)[0]['capability-hub'];
      if (client === 'codex') assert.deepEqual(service.scopes, scopes);
      else if (client === 'opencode' || client === 'pi')
        assert.deepEqual(service.oauth, { scope: scopes.join(' ') });
      else if (client === 'gemini-cli') assert.deepEqual(service.oauth, { enabled: true, scopes });
      else if (permission === 'contribute') {
        assert.equal(guide.method, 'assistant');
        assert.deepEqual(service.args, [
          'bridge',
          '--url',
          new URL(endpoint).origin,
          '--client',
          client,
        ]);
        assert(guide.assistant_command.includes('--scope user --contribute'));
        assert.equal(
          guide.assistant_command.includes('--config-file ""'),
          client === 'claude-code' || client === 'vscode',
        );
        continue;
      }
      assert.equal(guide.method, 'oauth');
      assert.equal(service.httpUrl ?? service.url, endpoint);
    }
  }
});
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
