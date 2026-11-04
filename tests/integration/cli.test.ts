import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFile, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { HubApiClient } from '../../apps/cli/src/api-client.js';
import { serveTestHub } from '../support/server.js';
import { publishSkill, submitPublication } from '../support/application.js';

const execute = promisify(execFile);

function cli(
  arguments_: string[],
  token?: string,
  options: {
    terminal?: boolean;
    environment?: NodeJS.ProcessEnv;
    answers?: { prompt: string; input: string }[];
  } = {},
) {
  return new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
    const environment = { ...process.env, ...options.environment };
    if (token) environment.CAPABILITY_HUB_TOKEN = token;
    else delete environment.CAPABILITY_HUB_TOKEN;
    const bootstrap = `
      for (const stream of [process.stdin, process.stdout, process.stderr])
        Object.defineProperty(stream, 'isTTY', { value: true });
      process.stdin.setRawMode = () => process.stdin;
      process.argv = [process.argv[0], 'bin/capability-hub.mjs', ...process.argv.slice(1)];
      await import('./bin/capability-hub.mjs');
    `;
    const child = spawn(
      process.execPath,
      [
        '--conditions=development',
        '--import',
        'tsx',
        ...(options.terminal
          ? ['--input-type=module', '--eval', bootstrap, '--']
          : ['bin/capability-hub.mjs']),
        ...arguments_,
      ],
      { env: environment, stdio: ['pipe', 'pipe', 'pipe'], timeout: 15000 },
    );
    let stdout = '',
      stderr = '';
    child.stdout.setEncoding('utf8').on('data', (value: string) => {
      stdout += value;
    });
    const answers = [...(options.answers ?? [])];
    let promptOutput = '';
    child.stderr.setEncoding('utf8').on('data', (value: string) => {
      stderr += value;
      promptOutput += value;
      if (answers[0] && promptOutput.includes(answers[0].prompt)) {
        const answer = answers.shift()!;
        promptOutput = '';
        if (answers.length) child.stdin.write(answer.input);
        else child.stdin.end(answer.input);
      }
    });
    if (!answers.length) child.stdin.end();
    child.once('error', reject);
    child.once('close', (code) => resolve({ code, stdout, stderr }));
  });
}

test('CLI 短帮助、命令帮助和非交互入口不读取凭据或执行命令', async () => {
  for (const args of [[], ['-h'], ['--help'], ['--no-interactive']]) {
    const result = await cli(args);
    assert.equal(result.code, 0, result.stderr);
    assert(result.stdout.includes('Capability Hub'));
    assert(result.stdout.includes('connect'));
    assert.equal(result.stderr, '');
  }
  for (const args of [
    ['connect', '-h'],
    ['help', 'connect'],
  ]) {
    const result = await cli(args);
    assert.equal(result.code, 0, result.stderr);
    assert(result.stdout.includes('--client'));
    assert(result.stdout.includes('--no-browser'));
    assert(result.stdout.includes('--config-dir'));
    assert.equal(result.stdout.includes('mcp-config NAME'), false);
    assert.equal(result.stderr, '');
  }
});

test('CLI 拒绝无关选项和多余参数，URL 错误不回显其中的凭据', async () => {
  for (const args of [
    ['login', 'extra'],
    ['search', '--replace'],
    ['connect', '--client', 'invalid'],
    ['hub-config', '--scope', 'invalid'],
    ['conect'],
    ['hub-config', '--url', 'https://private-token@hub.example.test', '--client', 'pi'],
  ]) {
    const result = await cli(args);
    assert.equal(result.code, 1, JSON.stringify(args));
    assert.equal(result.stdout, '');
    assert(result.stderr.length > 0);
    assert.equal(result.stderr.includes('private-token'), false);
  }
  const version = await cli(['-V']);
  assert.equal(version.code, 0, version.stderr);
  assert.match(version.stdout.trim(), /^\d+\.\d+\.\d+/);
});

test('CLI 交互配置向导选择客户端和范围，stdout 仍是完整配置', async () => {
  const result = await cli(['hub-config'], undefined, {
    terminal: true,
    environment: { CI: '', TERM: 'xterm', NO_COLOR: '1' },
    answers: [
      { prompt: 'Hub 的 HTTP(S) 根地址', input: 'https://hub.example.test\r' },
      { prompt: '选择目标 Agent 客户端', input: '\u001b[B'.repeat(4) + '\r' },
      { prompt: '配置保存在哪个范围', input: '\u001b[B\r' },
    ],
  });
  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {
    mcpServers: {
      'capability-hub': { url: 'https://hub.example.test/mcp', oauth: { scope: 'hub:read' } },
    },
  });
  assert(result.stderr.includes('~/.pi/agent/mcp.json'));
});

test('CLI 菜单取消退出 130；脚本、JSON 和 bridge 即使连接终端也不询问', async () => {
  const environment = { CI: '', TERM: 'xterm', NO_COLOR: '1' };
  const cancelled = await cli([], undefined, {
    terminal: true,
    environment,
    answers: [{ prompt: '你想做什么', input: '\u0003' }],
  });
  assert.equal(cancelled.code, 130, cancelled.stderr);
  assert.equal(cancelled.stdout, '');
  for (const [args, extra] of [
    [['connect', '--no-interactive'], {}],
    [['connect'], { CI: '1' }],
    [['connect'], { TERM: 'dumb' }],
    [['search', '--json'], {}],
    [['bridge'], {}],
  ] as const) {
    const result = await cli([...args], 'test-only-token', {
      terminal: true,
      environment: { ...environment, ...extra },
    });
    assert.equal(result.code, 1, result.stderr);
    assert.equal(result.stdout, '');
    assert(result.stderr.includes('--url'));
    assert.equal(result.stderr.includes('test-only-token'), false);
  }
});

test('CLI 交互安装需明确选择版本，仍校验下载内容并返回纯 JSON', async (context) => {
  const fixture = await serveTestHub(context);
  await publishSkill(fixture);
  const token = await fixture.hub.tokens.issue(fixture.admin, {
    name: '交互 CLI',
    scope: 'hub:read',
  });
  const destination = join(await realpath(fixture.directory), 'interactive-skills');
  const result = await cli(
    ['add', 'sample-skill', '--url', fixture.origin, '--to', destination],
    token.token,
    {
      terminal: true,
      environment: { CI: '', TERM: 'xterm', NO_COLOR: '1' },
      answers: [{ prompt: '选择明确的资源版本', input: '\r' }],
    },
  );
  assert.equal(result.code, 0, result.stderr);
  const installed: unknown = JSON.parse(result.stdout);
  assert(installed && typeof installed === 'object' && 'dry_run' in installed);
  assert.equal(installed.dry_run, false);
  assert(
    (await readFile(join(destination, 'sample-skill/SKILL.md'), 'utf8')).includes('sample-skill'),
  );
  assert.equal((result.stdout + result.stderr).includes(token.token), false);
});

test('CLI 关闭动效后仍可补全参数，任务状态和结果分开输出', async (context) => {
  const fixture = await serveTestHub(context);
  await publishSkill(fixture);
  const token = await fixture.hub.tokens.issue(fixture.admin, {
    name: '静态 CLI',
    scope: 'hub:read',
  });
  const destination = join(await realpath(fixture.directory), 'static-skills');
  const result = await cli(
    [
      'add',
      'sample-skill',
      '--url',
      fixture.origin,
      '--to',
      destination,
      '--dry-run',
      '--no-animation',
    ],
    token.token,
    {
      terminal: true,
      environment: { CI: '', TERM: 'xterm', NO_COLOR: '1' },
      answers: [{ prompt: '选择明确的资源版本', input: '\r' }],
    },
  );
  assert.equal(result.code, 0, result.stderr);
  const preview: unknown = JSON.parse(result.stdout);
  assert(preview && typeof preview === 'object' && 'dry_run' in preview);
  assert.equal(preview.dry_run, true);
  assert(result.stderr.includes('归档下载完成'));
  assert.equal((result.stdout + result.stderr).includes(token.token), false);
});

test('CLI 在授权等待动效中取消以 130 退出，不写配置或凭据', async (context) => {
  const fixture = await serveTestHub(context);
  const directory = join(await realpath(fixture.directory), 'cancelled-credentials');
  const target = join(await realpath(fixture.directory), 'cancelled-mcp.json');
  const result = await cli(
    [
      'connect',
      '--url',
      fixture.origin,
      '--client',
      'cursor',
      '--config-dir',
      directory,
      '--config-file',
      target,
      '--no-browser',
    ],
    undefined,
    {
      terminal: true,
      environment: { CI: '', TERM: 'xterm', NO_COLOR: '1' },
      answers: [{ prompt: '等待浏览器授权', input: '\u0003' }],
    },
  );
  assert.equal(result.code, 130, result.stderr);
  assert.equal(result.stdout, '');
  await assert.rejects(readFile(target), { code: 'ENOENT' });
  await assert.rejects(readdir(directory), { code: 'ENOENT' });
});

test('CLI 下载进度按接收字节累计，不把压缩或无效长度当成总大小', async (context) => {
  for (const [headers, totals] of [
    [{ 'content-length': '7' }, [7, 7, 7]],
    [{ 'content-length': '4', 'content-encoding': 'gzip' }, [undefined, undefined, undefined]],
    [{}, [undefined, undefined, undefined]],
    [{ 'content-length': 'invalid' }, [undefined, undefined, undefined]],
    [{ 'content-length': '4' }, [4, 4, undefined]],
    [{ 'content-length': String(121 * 1024 * 1024) }, [undefined, undefined, undefined]],
  ] as const) {
    const response = new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(Buffer.from('abc'));
          controller.enqueue(Buffer.from('defg'));
          controller.close();
        },
      }),
      { headers },
    );
    const request = context.mock.method(globalThis, 'fetch', async () => response);
    const progress: { received: number; total?: number }[] = [];
    const bytes = await new HubApiClient('https://hub.example.test').archive(
      '/archive',
      (received, total) => {
        progress.push({ received, total });
      },
    );
    assert.equal(bytes.toString(), 'abcdefg');
    assert.deepEqual(
      progress,
      [0, 3, 7].map((received, i) => ({ received, total: totals[i] })),
    );
    request.mock.restore();
  }
});

test('CLI 发布包在空缓存和仓库外离线安装，仅安装自身且能通过 HTTP 安装 Skill', async (context) => {
  const root = await mkdtemp(join(await realpath(tmpdir()), 'hub-cli-package-'));
  context.after(() => rm(root, { recursive: true, force: true }));
  const environment = { ...process.env };
  delete environment.NODE_OPTIONS;
  delete environment.NODE_PATH;
  delete environment.CAPABILITY_HUB_TOKEN;
  await execute(
    'pnpm',
    [
      '--dir',
      fileURLToPath(new URL('../../apps/cli/', import.meta.url)),
      'pack',
      '--pack-destination',
      root,
    ],
    { cwd: root, env: environment },
  );
  const archives = (await readdir(root)).filter((name) => name.endsWith('.tgz'));
  assert.equal(archives.length, 1);
  const consumer = join(root, 'consumer');
  await mkdir(consumer);
  await writeFile(join(consumer, 'package.json'), '{"name":"cli-consumer","private":true}');
  const options = { cwd: consumer, env: environment };
  await execute(
    'npm',
    [
      'install',
      join(root, archives[0]),
      '--offline',
      '--no-audit',
      '--no-fund',
      '--cache',
      join(root, 'cache'),
    ],
    options,
  );
  const tree = await execute('npm', ['ls', '--all', '--parseable'], options);
  assert.deepEqual(tree.stdout.trim().split(/\r?\n/), [
    consumer,
    join(consumer, 'node_modules/@capability-hub/cli'),
  ]);
  const manifest: unknown = JSON.parse(
    await readFile(join(consumer, 'node_modules/@capability-hub/cli/package.json'), 'utf8'),
  );
  assert(manifest && typeof manifest === 'object');
  assert(!('private' in manifest) || manifest.private !== true);
  const binary = join(consumer, 'node_modules/.bin/capability-hub');
  const help = await execute(binary, ['--help'], options);
  assert(help.stdout.includes('Capability Hub'));

  const fixture = await serveTestHub(context);
  await publishSkill(fixture);
  const token = await fixture.hub.tokens.issue(fixture.admin, { name: 'CLI', scope: 'hub:read' });
  const destination = join(root, 'skills');
  await execute(
    binary,
    ['add', 'sample-skill', '--version', '1.0.0', '--url', fixture.origin, '--to', destination],
    { ...options, env: { ...environment, CAPABILITY_HUB_TOKEN: token.token } },
  );
  assert(
    (await readFile(join(destination, 'sample-skill/SKILL.md'), 'utf8')).includes('sample-skill'),
  );
});

test('CLI 子进程通过真实 HTTP 搜索和安装已发布内容，撤权后不能再次交付，错误不输出令牌', async (context) => {
  const fixture = await serveTestHub(context);
  await publishSkill(fixture);
  const token = await fixture.hub.tokens.issue(fixture.admin, { name: 'CLI', scope: 'hub:read' });
  const root = await mkdtemp(join(await realpath(tmpdir()), 'hub-cli-'));
  context.after(() => rm(root, { recursive: true, force: true }));
  const search = await cli(['search', 'sample', '--url', fixture.origin, '--json'], token.token);
  assert.equal(search.code, 0, search.stderr);
  const result: unknown = JSON.parse(search.stdout);
  assert(result && typeof result === 'object' && 'total' in result);
  assert.equal(result.total, 1);
  const arguments_ = [
    'add',
    'sample-skill',
    '--version',
    '1.0.0',
    '--url',
    fixture.origin,
    '--to',
    join(root, 'skills'),
  ];
  const preview = await cli([...arguments_, '--dry-run'], token.token);
  assert.equal(preview.code, 0, preview.stderr);
  await assert.rejects(() => readFile(join(root, 'skills/sample-skill/SKILL.md')), {
    code: 'ENOENT',
  });
  const installed = await cli(arguments_, token.token);
  assert.equal(installed.code, 0, installed.stderr);
  assert(
    (await readFile(join(root, 'skills/sample-skill/SKILL.md'), 'utf8')).includes('sample-skill'),
  );
  const second = await cli(arguments_, token.token);
  assert.equal(second.code, 1);
  assert(second.stderr.includes('TARGET_EXISTS'));
  await fixture.hub.tokens.revoke(
    fixture.admin.id,
    (await fixture.hub.tokens.list(fixture.admin.id))[0].id,
  );
  const revoked = await cli(['search', 'sample', '--url', fixture.origin], token.token);
  assert.equal(revoked.code, 1);
  assert.equal(revoked.stderr.includes(token.token), false);
  assert(revoked.stderr.includes('UNAUTHENTICATED'));
});

test('CLI 为新增客户端生成真实已发布 MCP 配置，stdout 可解析且提示不泄漏 Hub 令牌', async (context) => {
  const fixture = await serveTestHub(context);
  const receipt = await fixture.hub.intakes.receive(
    fixture.admin,
    Buffer.from(
      JSON.stringify({
        name: 'local.capability-hub/cli-docs',
        version: '1.0.0',
        description: 'CLI 文档检索',
        remotes: [
          {
            type: 'streamable-http',
            url: 'https://docs.example.test/mcp',
            headers: [
              {
                name: 'Authorization',
                value: 'Bearer {DOCS_TOKEN}',
                isSecret: true,
                variables: { DOCS_TOKEN: {} },
              },
            ],
          },
        ],
      }),
    ),
    'server.json',
    {
      target: 'new',
      kind: 'mcp',
      slug: 'cli-docs',
      owner_group_id: fixture.teamId,
      version_label: '1.0.0',
    },
    randomUUID(),
  );
  await fixture.worker.tick();
  const intake = await fixture.hub.intakeQueries.getDetail(fixture.admin, receipt.intake_id);
  assert.equal(intake.state, 'ready', intake.error_message ?? '扫描未完成');
  assert(intake.version_id && intake.scan_run_id);
  const publication = await submitPublication(fixture, {
    ...intake,
    version_id: intake.version_id,
    scan_run_id: intake.scan_run_id,
  });
  await fixture.hub.publications.decide(
    fixture.reviewer,
    publication.id,
    {
      decision: 'approve',
      comment: '验证 CLI 配置交付',
      policy_digest: publication.policy_digest,
      accepted_warnings: [],
    },
    '"1"',
    randomUUID(),
  );
  const token = await fixture.hub.tokens.issue(fixture.admin, {
    name: 'CLI 配置',
    scope: 'hub:read',
  });
  for (const [client, root, path] of [
    ['opencode', 'mcp', 'opencode.json'],
    ['pi', 'mcpServers', '.pi/mcp.json'],
    ['gemini-cli', 'mcpServers', '.gemini/settings.json'],
    ['vscode', 'servers', '.vscode/mcp.json'],
    ['copilot-cli', 'mcpServers', '.mcp.json'],
  ]) {
    const result = await cli(
      ['mcp-config', 'cli-docs', '--version', '1.0.0', '--client', client, '--url', fixture.origin],
      token.token,
    );
    assert.equal(result.code, 0, result.stderr);
    const config: unknown = JSON.parse(result.stdout);
    assert(config && typeof config === 'object' && root in config);
    assert(result.stderr.includes(path));
    assert(result.stderr.includes('DOCS_TOKEN'));
    assert.equal((result.stdout + result.stderr).includes(token.token), false);
  }
  const userConfiguration = await cli(
    [
      'mcp-config',
      'cli-docs',
      '--version',
      '1.0.0',
      '--client',
      'pi',
      '--scope',
      'user',
      '--url',
      fixture.origin,
    ],
    token.token,
  );
  assert.equal(userConfiguration.code, 0, userConfiguration.stderr);
  assert(userConfiguration.stderr.includes('~/.pi/agent/mcp.json'));
});

test('CLI 首次接入无需凭据或服务连接，支持用户范围与完整对话说明', async (context) => {
  const root = await mkdtemp(join(await realpath(tmpdir()), 'hub-bootstrap-cli-'));
  context.after(() => rm(root, { recursive: true, force: true }));
  const args = [
    'hub-config',
    '--url',
    'https://hub.example.test',
    '--client',
    'opencode',
    '--scope',
    'user',
    '--config-dir',
    root,
  ];
  const result = await cli(args, 'test-only-must-not-be-read');
  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {
    mcp: {
      'capability-hub': {
        url: 'https://hub.example.test/mcp',
        type: 'remote',
        oauth: { scope: 'hub:read' },
      },
    },
  });
  assert(result.stderr.includes('~/.config/opencode/opencode.json'));
  assert.equal((result.stdout + result.stderr).includes('test-only-must-not-be-read'), false);
  await assert.rejects(() => readFile(join(root, 'auth.json')), { code: 'ENOENT' });
  await writeFile(join(root, 'auth.json'), 'invalid credentials', { mode: 0o600 });
  const conversation = await cli([...args, '--conversation']);
  assert.equal(conversation.code, 0, conversation.stderr);
  assert(conversation.stdout.includes(result.stdout.trim()));
  assert(conversation.stdout.includes('~/.config/opencode/opencode.json'));
  assert(conversation.stdout.includes('opencode mcp auth capability-hub'));
  assert.equal(conversation.stdout.includes('CAPABILITY_HUB_TOKEN'), false);
  assert.equal(await readFile(join(root, 'auth.json'), 'utf8'), 'invalid credentials');
  const contribution = await cli([
    ...args,
    '--method',
    'assistant',
    '--contribute',
    '--conversation',
  ]);
  assert.equal(contribution.code, 0, contribution.stderr);
  assert(contribution.stdout.includes('--contribute'));
  assert(contribution.stdout.includes('不要先手动写入'));
  const invalid = await cli([...args, '--scope', 'invalid']);
  assert.equal(invalid.code, 1);
});
