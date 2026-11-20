import assert from 'node:assert/strict';
import { after, test, type TestContext } from 'node:test';
import { execFile, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { once } from 'node:events';
import { createServer, type RequestListener } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import {
  cliInstallationGuide,
  hubFeedbackCreateRequestSchema,
  hubFeedbackLastFailureSchema,
} from '@capability-hub/contracts';
import { sha256 } from '@capability-hub/domain/canonical';
import { z } from 'zod';
import { HubApiClient } from '../../apps/cli/src/api-client.js';
import { saveCredentials } from '../../apps/cli/src/credentials.js';
import { serveTestHub } from '../support/server.js';
import { publishSkill, submitPublication } from '../support/application.js';
import { hubClientSkillFiles } from '../support/content.js';
import { deferred } from '../support/store.js';
import cliPackage from '../../apps/cli/package.json' with { type: 'json' };

const execute = promisify(execFile);
const testHome = await mkdtemp(join(await realpath(tmpdir()), 'hub-cli-home-'));

after(() => rm(testHome, { recursive: true, force: true }));

function cli(
  arguments_: string[],
  token?: string,
  options: {
    terminal?: boolean;
    environment?: NodeJS.ProcessEnv;
    cwd?: string;
    answers?: { prompt: string; input: string }[];
  } = {},
) {
  return new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
    const environment = {
      ...process.env,
      HOME: testHome,
      USERPROFILE: testHome,
      ...options.environment,
    };
    if (token !== undefined) environment.CAPABILITY_HUB_TOKEN = token;
    else delete environment.CAPABILITY_HUB_TOKEN;
    const bootstrap = `
      for (const stream of [process.stdin, process.stdout, process.stderr])
        Object.defineProperty(stream, 'isTTY', { value: true });
      process.stdin.setRawMode = () => process.stdin;
      process.argv = [process.argv[0], 'bin/capability-hub.mjs', ...process.argv.slice(1)];
      await import('./bin/capability-hub.mjs');
    `;
    const child = spawn(
      process.env.CAPABILITY_HUB_CLI_TEST_NODE ?? process.execPath,
      [
        '--conditions=development',
        '--import',
        import.meta.resolve('tsx'),
        ...(options.terminal
          ? ['--input-type=module', '--eval', bootstrap, '--']
          : [fileURLToPath(new URL('../../bin/capability-hub.mjs', import.meta.url))]),
        ...arguments_,
      ],
      { cwd: options.cwd, env: environment, stdio: ['pipe', 'pipe', 'pipe'], timeout: 15000 },
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

test('CLI 分组菜单与配置向导选择正确命令、客户端和范围，stdout 仍是完整配置', async () => {
  for (const args of [[], ['hub-config']]) {
    const result = await cli(args, undefined, {
      terminal: true,
      environment: { CI: '', TERM: 'xterm', NO_COLOR: '1' },
      answers: [
        ...(args.length ? [] : [{ prompt: '你想做什么', input: '\u001b[B'.repeat(6) + '\r' }]),
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
  }
});

test('CLI 缺少 Agent 连接凭据时提示 connect，不暴露底层路径或创建凭据', async (context) => {
  const root = await mkdtemp(join(await realpath(tmpdir()), 'hub-cli-unconnected-'));
  context.after(() => rm(root, { recursive: true, force: true }));
  const directory = join(root, 'credentials');
  for (const command of ['status', 'bridge']) {
    const result = await cli(
      [command, '--url', 'http://127.0.0.1:1/', '--client', 'codex', '--config-dir', directory],
      undefined,
      {
        terminal: command === 'status',
        environment: { CI: '', TERM: 'xterm', NO_COLOR: '1' },
      },
    );
    assert.equal(result.code, 1, result.stderr);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /连接凭据/);
    assert.match(result.stderr, /capability-hub connect/);
    assert.match(result.stderr, /--config-dir/);
    assert.doesNotMatch(result.stderr, /ENOENT|[a-f0-9]{64}\.json/);
    assert.deepEqual(await readdir(directory), ['last-failure.json']);
    const raw = await readFile(join(directory, 'last-failure.json'), 'utf8');
    assert.equal(hubFeedbackLastFailureSchema.parse(JSON.parse(raw)).command, command);
  }
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
  assert.doesNotMatch(result.stderr, /\[\d+(?:m \d+)?s\]/);
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

test('CLI 下载归档在 30 秒没有新数据时才中止，持续传输超过 30 秒仍能完成', async (context) => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  // AbortSignal.timeout 不受模拟时钟控制，换成同一时钟上的等价实现，用例不依赖客户端的计时方式。
  context.mock.method(AbortSignal, 'timeout', (milliseconds: number) => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(new DOMException('计时结束', 'TimeoutError')), milliseconds);
    return controller.signal;
  });
  let source: ReadableStreamDefaultController<Uint8Array> | undefined;
  context.mock.method(globalThis, 'fetch', async (_input: unknown, init?: RequestInit) => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        source = controller;
      },
    });
    init?.signal?.addEventListener('abort', () => source?.error(init.signal?.reason));
    return new Response(body);
  });
  let arrived = deferred();
  const client = new HubApiClient('https://hub.example.test');
  const onProgress = (received: number) => {
    if (received > 0) arrived.resolve();
  };
  const receive = async (pending: Promise<Buffer>) => {
    source?.enqueue(new Uint8Array(1024));
    await Promise.race([arrived.promise, pending]);
    arrived = deferred();
  };
  const progressing = client.archive('/archive', onProgress);
  for (let index = 0; index < 4; index++) {
    await receive(progressing);
    context.mock.timers.tick(20_000);
  }
  source?.close();
  assert.equal((await progressing).length, 4096);
  const stalled = client.archive('/archive', onProgress);
  await receive(stalled);
  context.mock.timers.tick(30_000);
  await assert.rejects(stalled);
});

test('CLI 安装命令覆盖已有 npm 作用域仓库，沿用当前仓库认证且不改写配置', async (context) => {
  const root = await mkdtemp(join(await realpath(tmpdir()), 'hub-cli-registry-'));
  context.after(() => rm(root, { recursive: true, force: true }));
  const requests: { path: string; authorization: string | undefined }[] = [];
  let registry = '';
  let authenticated = false;
  const server = createServer((req, res) => {
    const path = decodeURIComponent(req.url ?? '');
    requests.push({ path, authorization: req.headers.authorization });
    if (path !== '/repository/npm/@capability-hub/cli') {
      res.writeHead(404).end();
      return;
    }
    if (authenticated && req.headers.authorization !== 'Bearer registry-test-token') {
      res.writeHead(401).end();
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(
      JSON.stringify({
        name: '@capability-hub/cli',
        'dist-tags': { latest: '0.1.0' },
        versions: {
          '0.1.0': {
            name: '@capability-hub/cli',
            version: '0.1.0',
            dist: { tarball: `${registry}cli-0.1.0.tgz` },
          },
        },
      }),
    );
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  context.after(
    () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  );
  const address = server.address();
  assert(address && typeof address !== 'string');
  const origin = `http://127.0.0.1:${address.port}`;
  registry = `${origin}/repository/npm/`;
  const command = cliInstallationGuide('https://hub.example', registry)
    .steps.find((step) => step.command?.startsWith('npm install'))
    ?.command?.split('\n')[0];
  assert(command);
  for (authenticated of [false, true]) {
    const directory = join(root, authenticated ? 'authenticated' : 'anonymous');
    await mkdir(join(directory, 'prefix/lib/node_modules'), { recursive: true });
    const userconfig = join(directory, 'user.npmrc');
    const globalconfig = join(directory, 'global.npmrc');
    const configurations: [string, string][] = [
      [
        userconfig,
        `@capability-hub:registry=${origin}/old-user/\n${authenticated ? `//127.0.0.1:${address.port}/repository/npm/:_authToken=registry-test-token\n` : ''}`,
      ],
      [globalconfig, `@capability-hub:registry=${origin}/old-global/\n`],
      [join(directory, '.npmrc'), `@capability-hub:registry=${origin}/old-project/\n`],
    ];
    for (const [path, content] of configurations) await writeFile(path, content);
    requests.length = 0;
    await execute(
      'sh',
      ['-c', `${command} --dry-run --ignore-scripts --no-audit --no-fund --fetch-retries=0`],
      {
        cwd: directory,
        env: {
          PATH: process.env.PATH,
          npm_config_userconfig: userconfig,
          npm_config_globalconfig: globalconfig,
          npm_config_prefix: join(directory, 'prefix'),
          npm_config_cache: join(directory, 'cache'),
          npm_config_update_notifier: 'false',
        },
        timeout: 15000,
      },
    );
    assert(requests.length > 0);
    for (const request of requests) {
      assert.equal(request.path, '/repository/npm/@capability-hub/cli');
      assert.equal(request.authorization, authenticated ? 'Bearer registry-test-token' : undefined);
    }
    for (const [path, content] of configurations)
      assert.equal(await readFile(path, 'utf8'), content);
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

test('CLI 安装官方多文件 Skill 时保留全部参考资料和目录结构', async (context) => {
  const fixture = await serveTestHub(context);
  const files = await hubClientSkillFiles();
  const slug = 'use-capability-hub';
  await publishSkill(fixture, { slug, files });
  const token = await fixture.hub.tokens.issue(fixture.reader, {
    name: '完整 Skill 安装',
    scope: 'hub:read',
  });
  const destination = join(await realpath(fixture.directory), 'client-skills');
  const result = await cli(
    [
      'add',
      slug,
      '--version',
      '1.0.0',
      '--url',
      fixture.origin,
      '--to',
      destination,
      '--no-interactive',
    ],
    token.token,
  );
  assert.equal(result.code, 0, result.stderr);
  assert(files.some((file) => file.path.startsWith('references/')));
  for (const file of files)
    assert.deepEqual(await readFile(join(destination, slug, file.path)), file.bytes);
});

test('CLI 使用落盘登录凭据执行非交互搜索，返回可解析 JSON 且不输出令牌', async (context) => {
  const fixture = await serveTestHub(context);
  await publishSkill(fixture);
  const token = await fixture.hub.tokens.issue(fixture.admin, { name: 'CLI', scope: 'hub:read' });
  const directory = join(await realpath(fixture.directory), 'config/cli');
  await saveCredentials(join(directory, 'auth.json'), { url: fixture.origin, token: token.token });
  const result = await cli([
    'search',
    'sample',
    '--url',
    fixture.origin,
    '--config-dir',
    directory,
    '--json',
    '--no-interactive',
  ]);
  assert.equal(result.code, 0, result.stderr);
  const body: unknown = JSON.parse(result.stdout);
  assert(body && typeof body === 'object' && 'total' in body);
  assert.equal(body.total, 1);
  assert.equal((result.stdout + result.stderr).includes(token.token), false);
});

test('CLI 版本提示区分最低与推荐版本，忽略无效头，不污染 JSON 输出', async (context) => {
  const data = { items: [], total: 0 };
  let header: string | undefined;
  const server = createServer((_req, res) => {
    if (header) res.setHeader('X-Capability-Hub-CLI', header);
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(data));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  context.after(() => promisify(server.close.bind(server))());
  const address = server.address();
  assert(address && typeof address === 'object');
  const origin = `http://127.0.0.1:${address.port}`;
  const current = cliPackage.version;
  const nextMajor = Number(current.split('.')[0]) + 1;
  const minimum = `${nextMajor}.1.0`;
  const recommended = `${nextMajor}.2.0`;
  for (const [advertised, quiet, expected] of [
    [`recommended=${recommended}, minimum=${minimum}`, false, minimum],
    [`recommended=${recommended}, minimum=${current}`, false, recommended],
    [`recommended=${current}, minimum=${current}`, false, null],
    ['recommended=0.0.1, minimum=0.0.1', false, null],
    [undefined, false, null],
    [`recommended=v${recommended}, minimum=${current}`, false, null],
    [`recommended=${recommended}, minimum=${minimum}-01`, false, null],
    [`recommended=${recommended}, minimum=${current}, url=https://wrong.example`, false, null],
    [`recommended=${recommended}, minimum=${minimum}`, true, null],
  ] as const) {
    header = advertised;
    const result = await cli(['search', '--url', origin, '--json'], 'fixture-token', {
      environment: { CAPABILITY_HUB_NO_UPDATE_NOTICE: quiet ? '1' : '0' },
    });
    assert.equal(result.code, 0, result.stderr);
    assert.equal(result.stdout, JSON.stringify(data, null, 2) + '\n');
    if (expected) {
      assert.equal(result.stderr.trimEnd().split('\n').length, 1);
      assert(result.stderr.includes(current));
      assert(result.stderr.includes(expected));
      if (expected === minimum) assert(!result.stderr.includes(recommended));
      assert(result.stderr.includes(`${origin}/connect/cli`));
    } else {
      assert.equal(result.stderr, '', advertised);
    }
  }
});

const feedbackReport = {
  kind: 'bug',
  surface: 'mcp',
  title: 'Agent connection hangs',
  description: 'The terminal stays on the connection screen.',
};

function feedbackNew(origin: string, directory: string, report = feedbackReport) {
  return [
    'feedback',
    'new',
    '--url',
    origin,
    '--config-dir',
    directory,
    '--kind',
    report.kind,
    '--surface',
    report.surface,
    '--title',
    report.title,
    '--description',
    report.description,
  ];
}

async function serveCliFeedbackBoundary(context: TestContext, respond?: RequestListener) {
  const root = await mkdtemp(join(await realpath(tmpdir()), 'hub-cli-feedback-'));
  context.after(() => rm(root, { recursive: true, force: true }));
  const requests: string[] = [];
  const server = createServer((request, response) => {
    requests.push(`${request.method} ${request.url}`);
    request.resume();
    if (respond) respond(request, response);
    else response.writeHead(500).end();
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  context.after(() => promisify(server.close.bind(server))());
  const address = server.address();
  assert(address && typeof address === 'object');
  return {
    root,
    directory: join(root, 'cli-config'),
    origin: `http://127.0.0.1:${address.port}`,
    requests,
  };
}

const feedbackAttachmentFields = {
  name: z.string(),
  kind: z.string(),
  media_type: z.string(),
  size: z.number(),
};

const feedbackPreview = z.strictObject({
  metadata: hubFeedbackCreateRequestSchema,
  attachments: z.array(z.strictObject(feedbackAttachmentFields)),
});

test('CLI 反馈 JSON 预览不访问 Hub，只展示元数据和附件清单', async (context) => {
  const { root, directory, origin, requests } = await serveCliFeedbackBoundary(context);
  const name = 'debug.log';
  const file = join(root, name);
  const content = '附件原文不得通过预览输出';
  await writeFile(file, content);
  const token = 'cli-feedback-preview-token';
  const result = await cli(
    [...feedbackNew(origin, directory), '--attach', file, '--dry-run', '--json'],
    token,
  );
  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(requests, []);
  const { metadata, attachments } = feedbackPreview.parse(JSON.parse(result.stdout));
  assert.deepEqual(
    {
      kind: metadata.kind,
      surface: metadata.surface,
      title: metadata.title,
      description: metadata.description,
    },
    feedbackReport,
  );
  assert.deepEqual(attachments, [
    { name, kind: 'text', media_type: 'text/plain', size: Buffer.byteLength(content) },
  ]);
  for (const hidden of [token, content, file]) {
    assert(!(result.stdout + result.stderr).includes(hidden));
  }
});

test('CLI 非交互反馈缺少 --yes 时拒绝发送', async (context) => {
  const { directory, origin, requests } = await serveCliFeedbackBoundary(context);
  const result = await cli(
    [...feedbackNew(origin, directory), '--no-interactive'],
    'cli-feedback-unconfirmed-token',
  );
  assert.equal(result.code, 1, result.stderr);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /确认.*--yes/);
  assert.deepEqual(requests, []);
});

test('CLI 向真实 Hub 提交反馈附件并返回编号和详情地址，同内容跨进程重试返回同一条', async (context) => {
  const fixture = await serveTestHub(context);
  const { token } = await fixture.hub.tokens.issue(fixture.reader, {
    name: 'CLI 反馈',
    scope: 'hub:read',
  });
  const directory = await realpath(fixture.directory);
  const name = 'diagnostics.txt';
  const file = join(directory, name);
  const content = '连接进度停在等待授权。';
  await writeFile(file, content);
  const arguments_ = [
    ...feedbackNew(fixture.origin, join(directory, 'cli-config')),
    '--attach',
    file,
    '--yes',
    '--json',
  ];
  const result = await cli(arguments_, token);
  assert.equal(result.code, 0, result.stderr);
  const created = z
    .object({
      id: z.uuid(),
      number: z.number().int().positive(),
      status: z.literal('pending'),
      detail_url: z.url(),
      attachments: z.array(z.object({ ...feedbackAttachmentFields, id: z.uuid() })),
    })
    .parse(JSON.parse(result.stdout));
  assert.equal(created.number, 1);
  assert.equal(created.detail_url, `${fixture.origin}/account?tab=feedback&feedback=${created.id}`);
  assert.equal(created.attachments.length, 1);
  const [{ id, ...attachment }] = created.attachments;
  assert.deepEqual(attachment, {
    name,
    kind: 'text',
    media_type: 'text/plain',
    size: Buffer.byteLength(content),
  });
  const attachmentUrl = `${fixture.origin}/api/hub-feedback/${created.id}/attachments/${id}`;
  const response = await fetch(attachmentUrl, { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(response.status, 200);
  assert.equal(await response.text(), content);
  const replayed = await cli(arguments_, token);
  assert.equal(replayed.code, 0, replayed.stderr);
  assert.deepEqual(JSON.parse(replayed.stdout), JSON.parse(result.stdout));
  assert(!(result.stdout + result.stderr + replayed.stdout + replayed.stderr).includes(token));
});

test('CLI 向旧版 Hub 提交反馈收到 404 时提示改用网页', async (context) => {
  const { directory, origin, requests } = await serveCliFeedbackBoundary(context, (_req, res) => {
    res.writeHead(404).end();
  });
  const result = await cli(
    [...feedbackNew(origin, directory), '--yes', '--json'],
    'cli-feedback-older-hub-token',
  );
  assert.equal(result.code, 1, result.stderr);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /尚不支持 CLI 反馈.*网页/);
  assert.deepEqual(requests, ['POST /api/hub-feedback']);
});

test('CLI 私有记录失败请求，反馈预览只附带脱敏诊断', async (context) => {
  const requestId = randomUUID();
  const error = { code: 'SERVICE_UNAVAILABLE', message: '实例维护中', request_id: requestId };
  const { directory, origin, requests } = await serveCliFeedbackBoundary(context, (_req, res) => {
    res.writeHead(503, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error }));
  });
  const token = 'environment-value-must-not-leak';
  const storedToken = 'auth-file-value-must-not-leak';
  await saveCredentials(join(directory, 'auth.json'), { url: origin, token: storedToken });
  const title = 'Failed report title must not leak';
  const description = 'Failed report description must not leak';
  const failed = await cli(
    [
      ...feedbackNew(origin, directory, { ...feedbackReport, title, description }),
      '--yes',
      '--json',
    ],
    token,
  );
  assert.equal(failed.code, 1, failed.stderr);
  assert.equal(failed.stdout, '');
  assert(failed.stderr.includes(`请求编号：${requestId}`));
  const path = join(directory, 'last-failure.json');
  const rawRecord = await readFile(path, 'utf8');
  assert(Buffer.byteLength(rawRecord) <= 16 * 1024);
  if (process.platform !== 'win32') assert.equal((await stat(path)).mode & 0o077, 0);
  const record = hubFeedbackLastFailureSchema.parse(JSON.parse(rawRecord));
  assert.equal(record.command, 'feedback new');
  assert.equal(record.exit_code, 1);
  assert.equal(record.status, 503);
  assert.equal(record.code, 'SERVICE_UNAVAILABLE');
  assert.equal(record.request_id, requestId);
  assert.equal(record.hub_origin, origin);
  assert.deepEqual(record.arguments, []);
  for (const option of ['--title', '--description', '--config-dir']) {
    assert(record.options.includes(option));
  }
  const result = await cli(
    [...feedbackNew(origin, directory), '--last-error', '--dry-run', '--json'],
    token,
  );
  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(requests, ['POST /api/hub-feedback']);
  const client = feedbackPreview.parse(JSON.parse(result.stdout)).metadata.diagnostics?.client;
  assert(client?.kind === 'cli');
  assert.deepEqual(client.last_failure, record);
  for (const hidden of [token, storedToken, title, description, directory]) {
    assert(!(failed.stderr + rawRecord + result.stdout + result.stderr).includes(hidden));
  }
});

test('CLI 反馈遇到附件凭据时在联网前拒绝并隐藏匹配内容', async (context) => {
  const { root, directory, origin, requests } = await serveCliFeedbackBoundary(context);
  const file = join(root, 'debug.log');
  const fakeSecret = `ghp_${'x'.repeat(36)}`;
  await writeFile(file, `Unrelated message\n${fakeSecret}`);
  const result = await cli(
    [...feedbackNew(origin, directory), '--attach', file, '--yes', '--json'],
    'cli-feedback-attachment-token',
  );
  assert.equal(result.code, 1, result.stderr);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /debug\.log.*第 2 行/);
  assert(!result.stderr.includes(fakeSecret));
  assert.deepEqual(requests, []);
});

test('CLI 子进程通过真实 HTTP 搜索和安装已发布内容，撤权后不能再次交付，错误不输出令牌', async (context) => {
  const fixture = await serveTestHub(context);
  const { intake } = await publishSkill(fixture, { body: '固定旧版测试正文' });
  await publishSkill(fixture, {
    assetId: intake.asset_id,
    version: '2.0.0',
    body: '最新版测试正文',
  });
  const token = await fixture.hub.tokens.issue(fixture.admin, { name: 'CLI', scope: 'hub:read' });
  const root = await mkdtemp(join(await realpath(tmpdir()), 'hub-cli-'));
  context.after(() => rm(root, { recursive: true, force: true }));
  const query = cliInstallationGuide(fixture.origin)
    .steps.flatMap((step) => step.command?.split('\n') ?? [])
    .find((command) => command.startsWith('capability-hub search '));
  assert(query);
  const parsed = await execute('sh', [
    '-c',
    `capture() { printf '%s\\n' "$@"; }\n${query.replace(/^capability-hub /, 'capture ')}`,
  ]);
  const search = await cli([...parsed.stdout.trimEnd().split('\n'), 'sample'], token.token);
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
  const installed = await cli(arguments_, token.token, {
    environment: { CAPABILITY_HUB_NO_UPDATE_NOTICE: '0' },
  });
  assert.equal(installed.code, 0, installed.stderr);
  assert(installed.stderr.includes('2.0.0'));
  const installedBody = await readFile(join(root, 'skills/sample-skill/SKILL.md'), 'utf8');
  assert(installedBody.includes('固定旧版测试正文'));
  assert(!installedBody.includes('最新版测试正文'));
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

test('CLI 可匿名预览和安装公开 Skill，来源记录与下载审计保留版本和匿名身份', async (context) => {
  const fixture = await serveTestHub(context);
  const slug = 'sample-skill';
  const { intake } = await publishSkill(fixture, { slug });
  const root = await realpath(fixture.directory);
  const to = join(root, 'public-skills');
  const arguments_ = [
    'add',
    slug,
    '--version',
    '1.0.0',
    '--config-dir',
    join(root, 'unused-config'),
    '--to',
    to,
  ];
  const missingUrl = await cli(arguments_);
  assert.equal(missingUrl.code, 1);
  assert.match(missingUrl.stderr, /未登录时需要 --url/);

  arguments_.push('--url', fixture.origin);
  const preview = await cli([...arguments_, '--dry-run']);
  assert.equal(preview.code, 0, preview.stderr);
  assert.match(preview.stderr, /按匿名身份读取公开资源/);
  assert.equal(JSON.parse(preview.stdout).dry_run, true);
  await assert.rejects(() => readdir(to), { code: 'ENOENT' });
  const previewDownloads = await fixture.store.where('audit', 'action', 'content.download');
  assert.deepEqual(
    previewDownloads.map(({ actor_id, entity_id }) => [actor_id, entity_id]),
    [['anonymous', intake.version_id]],
  );

  const installed = await cli(arguments_);
  assert.equal(installed.code, 0, installed.stderr);
  assert.match(installed.stderr, /按匿名身份读取公开资源/);
  assert.equal(JSON.parse(installed.stdout).destination, join(to, slug));
  assert.match(await readFile(join(to, slug, 'SKILL.md'), 'utf8'), /sample-skill/);
  const receipt = JSON.parse(await readFile(join(to, slug, '.capability-hub-source'), 'utf8'));
  assert.equal(receipt.hub_url, fixture.origin);
  assert.equal(receipt.asset_id, intake.asset_id);
  assert.equal(receipt.version_id, intake.version_id);
  assert.equal(receipt.slug, slug);
  assert.equal(receipt.version_label, '1.0.0');
  assert.equal(
    receipt.release_id,
    (await fixture.hub.assetAccess.getAsset(intake.asset_id)).current_release_id,
  );
  const downloads = await fixture.store.where('audit', 'action', 'content.download');
  assert.deepEqual(
    downloads.map(({ actor_id, entity_id }) => [actor_id, entity_id]),
    [
      ['anonymous', intake.version_id],
      ['anonymous', intake.version_id],
    ],
  );
  assert.deepEqual(await readdir(join(root, 'unused-config')), ['last-failure.json']);
});

test('outdated 按安装状态检查来源、补全旧记录，并且只向匹配实例发送凭据', async (context) => {
  const fixture = await serveTestHub(context);
  const root = await realpath(fixture.directory);
  const config = join(root, 'outdated-config');
  const token = await fixture.hub.tokens.issue(fixture.reader, {
    name: 'outdated',
    scope: 'hub:read',
  });
  await saveCredentials(join(config, 'auth.json'), { url: fixture.origin, token: token.token });

  const slug = 'sample-skill';
  const { intake: old } = await publishSkill(fixture, { body: '旧版核对说明' });
  await publishSkill(fixture, {
    slug,
    assetId: old.asset_id,
    version: '2.0.0',
    body: '较新可读版本',
  });
  const { intake: withdrawn } = await publishSkill(fixture, {
    slug,
    assetId: old.asset_id,
    version: '3.0.0',
    body: '即将撤销的版本',
  });
  const deprecated = await publishSkill(fixture, {
    slug: 'deprecated-skill',
    distribution: { mode: 'approved_audience', audience: ['organization'] },
  });
  const successor = await publishSkill(fixture, { slug: 'successor-skill' });

  let foreignContact = false;
  const foreign = createServer((_req, res) => {
    foreignContact = true;
    res.writeHead(404).end();
  });
  foreign.listen(0, '127.0.0.1');
  await once(foreign, 'listening');
  context.after(() => promisify(foreign.close.bind(foreign))());
  const address = foreign.address();
  assert(address && typeof address === 'object');
  const otherHub = `http://127.0.0.1:${address.port}`;

  const cases = [
    ['current', '.agents/skills', slug, '2.0.0'],
    ['update_available', '.claude/skills', slug, '1.0.0'],
    ['deprecated', 'old-client', 'deprecated-skill', '1.0.0'],
    ['unavailable', 'withdrawn', slug, '3.0.0'],
    ['modified', 'edited', slug, '1.0.0'],
    ['other_hub', 'another-instance', slug, '2.0.0'],
  ] as const;
  const sourceFile = '.capability-hub-source';
  const parent = (name: string) => join(root, name);
  const receiptPath = (name: string, skill: string) => join(parent(name), skill, sourceFile);
  for (const [status, directory, skill, version] of cases) {
    const result = await cli([
      'add',
      skill,
      '--version',
      version,
      '--to',
      parent(directory),
      '--config-dir',
      config,
    ]);
    assert.equal(result.code, 0, result.stderr);
    const path = receiptPath(directory, skill);
    if (status === 'update_available') {
      const legacy = JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>;
      delete legacy.slug;
      delete legacy.version_label;
      await writeFile(path, JSON.stringify(legacy));
    }
    if (status === 'modified')
      await writeFile(join(parent(directory), skill, 'SKILL.md'), 'Edited locally');
    if (status === 'other_hub') {
      const receipt = JSON.parse(await readFile(path, 'utf8'));
      await writeFile(path, JSON.stringify({ ...receipt, hub_url: otherHub }));
    }
  }
  const legacyBefore = await readFile(receiptPath('.claude/skills', slug), 'utf8');
  const asset = await fixture.hub.assetAccess.getAsset(deprecated.intake.asset_id);
  await fixture.hub.lifecycle.updateState(
    fixture.admin,
    asset.id,
    {
      lifecycle: 'deprecated',
      reason: '已有继任资源',
      replacement_asset_id: successor.intake.asset_id,
    },
    `"${asset.revision}"`,
  );
  await fixture.hub.lifecycle.revokeVersion(fixture.admin, withdrawn.version_id, '停止旧安装分发');
  async function check(directories: readonly string[], expected: number, ...flags: string[]) {
    const result = await cli([
      'outdated',
      '--config-dir',
      config,
      '--json',
      ...directories.flatMap((name) => ['--to', parent(name)]),
      ...flags,
    ]);
    assert.equal(result.code, expected, result.stderr);
    return JSON.parse(result.stdout);
  }
  const entries = await check(
    cases.map(([, name]) => name),
    0,
  );
  assert.equal(entries[0].status, 'unavailable');
  assert.deepEqual(
    Object.fromEntries(
      entries.map((row: { path: string; status: string }) => [row.path, row.status]),
    ),
    Object.fromEntries(cases.map(([status, dir, skill]) => [join(parent(dir), skill), status])),
  );
  const [available, abandoned, modified, other] = [
    'update_available',
    'deprecated',
    'modified',
    'other_hub',
  ].map((status) => entries.find((row: { status: string }) => row.status === status));
  assert.equal(available.slug, slug);
  assert.equal(available.version_label, '1.0.0');
  assert.equal(available.latest_release.version_label, '2.0.0');
  assert.equal(abandoned.deprecation_reason, '已有继任资源');
  assert.equal(abandoned.replacement_asset_slug, 'successor-skill');
  assert(modified.differences.some((difference: string) => difference.includes('SKILL.md')));
  assert.equal(other.hub_url, otherHub);
  assert.equal(foreignContact, false);
  for (const [directories, expected] of [
    [['.claude/skills'], 2],
    [['withdrawn'], 2],
    [['.agents/skills', 'old-client', 'edited', 'another-instance'], 0],
  ] as const)
    await check(directories, expected, '--exit-code');
  await check(['.claude/skills'], 0, '--fail-on-modified');
  await check(['edited'], 3, '--fail-on-modified');
  await check(['edited', 'withdrawn'], 3, '--exit-code', '--fail-on-modified');

  const previewArgs = await execute('sh', [
    '-c',
    `capture() { printf '%s\\n' "$@"; }\n${available.next_step.replace(/^capability-hub /, 'capture ')}`,
  ]);
  const preview = await cli(previewArgs.stdout.trimEnd().split('\n'));
  assert.equal(preview.code, 0, preview.stderr);
  assert.equal(JSON.parse(preview.stdout).destination, join(parent('.claude/skills'), slug));
  assert.equal(await readFile(receiptPath('.claude/skills', slug), 'utf8'), legacyBefore);

  // 默认扫描遇到经过链接的预设目录时跳过它，其余目录照常检查。
  await symlink(parent('withdrawn'), join(root, '.cursor'));
  const anon = await cli(
    ['outdated', '--url', fixture.origin, '--config-dir', join(root, 'no-auth'), '--json'],
    undefined,
    { cwd: root },
  );
  assert.equal(anon.code, 0, anon.stderr);
  assert.deepEqual(
    JSON.parse(anon.stdout)
      .map((row: { status: string }) => row.status)
      .sort(),
    ['current', 'update_available'],
  );
  const table = await cli(['outdated', '--config-dir', config, '--to', parent('withdrawn')]);
  assert.equal(table.code, 0, table.stderr);
  assert.match(table.stdout, /STATUS.*SKILL.*INSTALLED.*LATEST.*PATH/);
  assert.match(table.stdout, /unavailable\s+sample-skill\s+3\.0\.0/);
});

test('outdated 仅报告含入口文件的无来源 Skill，不要求登录或指定 Hub', async (context) => {
  const root = await mkdtemp(join(await realpath(tmpdir()), 'hub-cli-unknown-source-'));
  context.after(() => rm(root, { recursive: true, force: true }));
  const parent = join(root, 'skills');
  const manual = join(parent, 'manual-skill');
  const staging = join(parent, '.capability-hub-stage-local');
  for (const path of [manual, staging]) {
    await mkdir(path, { recursive: true });
    await writeFile(join(path, 'SKILL.md'), '# 本地规范\n');
  }
  await mkdir(join(parent, 'not-a-skill'));

  const args = ['outdated', '--to', parent, '--config-dir', join(root, 'no-config')];
  const json = await cli([...args, '--json', '--exit-code', '--fail-on-modified']);
  assert.equal(json.code, 0, json.stderr);
  const entries = JSON.parse(json.stdout) as Array<{
    path: string;
    status: string;
    hub_url: string | null;
    version_id: string | null;
  }>;
  assert.deepEqual(
    entries.map(({ path, status, hub_url, version_id }) => ({ path, status, hub_url, version_id })),
    [{ path: manual, status: 'unknown_source', hub_url: null, version_id: null }],
  );
  const table = await cli(args);
  assert.equal(table.code, 0, table.stderr);
  assert.match(table.stdout, /unknown_source\s+manual-skill/);
  assert.match(table.stdout, /无法判定来源/);
});

test('匿名 CLI 安装不可见 Skill 时提示登录且不创建目录；无效凭据不会降级', async (context) => {
  const fixture = await serveTestHub(context);
  await publishSkill(fixture, {
    slug: 'private-skill',
    distribution: { mode: 'approved_audience', audience: ['organization'] },
  });
  await publishSkill(fixture, { slug: 'public-skill' });
  const root = await realpath(fixture.directory);
  const to = join(root, 'skills');
  const config = join(root, 'cli-config');
  const arguments_ = [
    '--version',
    '1.0.0',
    '--url',
    fixture.origin,
    '--to',
    to,
    '--config-dir',
    config,
  ];
  const hidden = await cli(['add', 'private-skill', ...arguments_]);
  assert.equal(hidden.code, 1);
  assert.equal(hidden.stdout, '');
  assert(hidden.stderr.includes(`capability-hub login --url ${fixture.origin}`));
  assert.match(hidden.stderr, /未找到可匿名访问的资源 private-skill/);

  const publicAdd = ['add', 'public-skill', ...arguments_];
  const auth = join(config, 'auth.json');
  await saveCredentials(auth, { url: 'https://other.example.test', token: 'other-instance-token' });
  const mismatched = await cli(publicAdd);
  const empty = await cli(publicAdd, '');
  await saveCredentials(auth, { url: fixture.origin, token: 'invalid-token' });
  const unauthorized = await cli(publicAdd);
  await writeFile(auth, '{}');
  const malformed = await cli(publicAdd);
  for (const [result, message] of [
    [mismatched, /与已登录的 Hub 地址不一致/],
    [empty, /CAPABILITY_HUB_TOKEN 必须是非空/],
    [unauthorized, /UNAUTHENTICATED/],
    [malformed, /凭据格式无效/],
  ] as const) {
    assert.equal(result.code, 1);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, message);
    assert.doesNotMatch(result.stderr, /按匿名身份|other-instance-token|invalid-token/);
  }
  await assert.rejects(() => readdir(to), { code: 'ENOENT' });
  assert.deepEqual(await fixture.store.where('audit', 'action', 'content.download'), []);
});

test('CLI 票据预览和目标冲突不消费票据；安装忽略其他实例凭据且不能重放', async (context) => {
  const fixture = await serveTestHub(context);
  const slug = 'ticket-skill';
  const { intake } = await publishSkill(fixture, {
    slug,
    distribution: { mode: 'approved_audience', audience: ['organization'] },
  });
  await publishSkill(fixture, {
    slug,
    assetId: intake.asset_id,
    version: '2.0.0',
    body: '票据资产最新发布',
    distribution: { mode: 'approved_audience', audience: ['organization'] },
  });
  const token = await fixture.hub.tokens.issue(fixture.reader, {
    name: '安装票据',
    scope: 'hub:read',
  });
  const { ticket, version } = await fixture.hub.installTickets.issue(
    fixture.reader,
    { kind: 'personal', id: sha256(token.token) },
    intake.version_id,
  );
  assert(ticket);
  const root = await realpath(fixture.directory);
  const to = join(root, 'ticket-skills');
  const destination = join(to, slug);
  const config = join(root, 'other-hub-cli');
  await saveCredentials(join(config, 'auth.json'), {
    url: 'https://other.example.test',
    token: 'other-instance-token',
  });
  const ticketUrl = `${fixture.origin}/api/install-tickets/${ticket}`;
  const arguments_ = ['add', '--ticket', ticketUrl, '--to', to, '--config-dir', config];
  const preview = await cli(
    [...arguments_, '--url', fixture.origin + '/', '--dry-run'],
    undefined,
    {
      environment: { CAPABILITY_HUB_NO_UPDATE_NOTICE: '0' },
    },
  );
  assert.equal(preview.code, 0, preview.stderr);
  assert(preview.stderr.includes('2.0.0'));
  assert.deepEqual(JSON.parse(preview.stdout), {
    dry_run: true,
    destination,
    existing: false,
    differences: [],
    files: version.manifest.files.map((file) => file.path),
  });
  await assert.rejects(() => readdir(to), { code: 'ENOENT' });

  await mkdir(destination, { recursive: true });
  const blocked = await cli(arguments_, undefined, { terminal: true });
  assert.equal(blocked.code, 1);
  assert.equal(blocked.stdout, '');
  assert.match(blocked.stderr, /TARGET_EXISTS/);
  assert.deepEqual(await readdir(destination), []);
  assert.deepEqual(await fixture.store.where('audit', 'action', 'content.download'), []);

  const installed = await cli([...arguments_, '--replace'], '');
  assert.equal(installed.code, 0, installed.stderr);
  const result = JSON.parse(installed.stdout);
  assert.equal(result.dry_run, false);
  assert.equal(result.destination, destination);
  assert.equal(result.files, version.manifest.files.length);
  assert.match(await readFile(join(destination, 'SKILL.md'), 'utf8'), /ticket-skill/);
  const receipt = JSON.parse(await readFile(join(destination, '.capability-hub-source'), 'utf8'));
  assert.deepEqual(receipt, {
    hub_url: fixture.origin,
    asset_id: intake.asset_id,
    version_id: intake.version_id,
    slug,
    version_label: '1.0.0',
    release_id: (await fixture.store.find('releases', 'version_id', intake.version_id))?.id,
    content_digest: version.content_digest,
    files: version.manifest.files,
  });

  const replay = await cli(arguments_);
  assert.equal(replay.code, 1);
  assert.equal(replay.stdout, '');
  assert.match(replay.stderr, /INSTALL_TICKET_USED.*重新调用 install_skill/);
  for (const { stdout, stderr } of [preview, blocked, installed, replay]) {
    assert(!(stdout + stderr).includes(ticket));
    assert(!(stdout + stderr).includes('other-instance-token'));
  }
  const downloads = await fixture.store.where('audit', 'action', 'content.download');
  assert.deepEqual(
    downloads.map(({ actor_id, entity_id }) => [actor_id, entity_id]),
    [[fixture.reader.id, intake.version_id]],
  );

  const invalid = await cli([
    'add',
    '--ticket',
    `${fixture.origin}/api/install-tickets/${'x'.repeat(43)}`,
    '--to',
    to,
  ]);
  assert.equal(invalid.code, 1);
  assert.equal(invalid.stdout, '');
  assert.match(invalid.stderr, /INSTALL_TICKET_INVALID.*重新调用 install_skill/);
  assert(!invalid.stderr.includes('x'.repeat(43)));
});

test('CLI 票据归档下载后签发凭据失效时，提交前复核拒绝写入目标 Skill', async (context) => {
  const fixture = await serveTestHub(context);
  const slug = 'ticket-skill';
  const { intake } = await publishSkill(fixture, {
    slug,
    distribution: { mode: 'approved_audience', audience: ['organization'] },
  });
  const { token } = await fixture.hub.tokens.issue(fixture.reader, {
    name: '下载后撤销',
    scope: 'hub:read',
  });
  const id = sha256(token);
  const { ticket } = await fixture.hub.installTickets.issue(
    fixture.reader,
    { kind: 'personal', id },
    intake.version_id,
  );
  assert(ticket);
  const readBlob = fixture.blobs.read.bind(fixture.blobs);
  context.mock.method(fixture.blobs, 'read', async (hash: string) => {
    const archive = await readBlob(hash);
    await fixture.hub.tokens.revoke(fixture.reader.id, id);
    return archive;
  });
  const to = join(await realpath(fixture.directory), 'ticket-skills');
  const result = await cli([
    'add',
    '--ticket',
    `${fixture.origin}/api/install-tickets/${ticket}`,
    '--to',
    to,
  ]);
  assert.equal(result.code, 1);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /INSTALL_TICKET_INVALID.*重新调用 install_skill/);
  assert(!result.stderr.includes(ticket));
  assert.deepEqual(await readdir(to), []);
  const downloads = await fixture.store.where('audit', 'action', 'content.download');
  assert.deepEqual(
    downloads.map(({ actor_id, entity_id }) => [actor_id, entity_id]),
    [[fixture.reader.id, intake.version_id]],
  );
});

test('CLI 票据模式保留 Hub 错误码和响应校验原因，不改写成笼统的连接失败', async (context) => {
  let reply: { status: number; body: unknown } = { status: 500, body: {} };
  const server = createServer((_request, response) =>
    response
      .writeHead(reply.status, { 'Content-Type': 'application/json' })
      .end(JSON.stringify(reply.body)),
  );
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  context.after(async () => {
    server.close();
    await once(server, 'close');
  });
  const address = server.address();
  assert(address && typeof address !== 'string');
  const ticketUrl = `http://127.0.0.1:${address.port}/api/install-tickets/${'t'.repeat(43)}`;
  for (const [status, body, message] of [
    [
      503,
      { error: { code: 'SERVICE_UNAVAILABLE', message: '实例维护中' } },
      /SERVICE_UNAVAILABLE: 实例维护中/,
    ],
    [200, { manifest: {} }, /Hub 响应结构无效/],
  ] as const) {
    reply = { status, body };
    const result = await cli(['add', '--ticket', ticketUrl, '--to', 'skills']);
    assert.equal(result.code, 1);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, message);
    assert(!result.stderr.includes('t'.repeat(43)));
  }
});

test('CLI 票据模式拒绝其他资源参数、非元数据地址和缺少明确目标目录', async () => {
  const ticket = 't'.repeat(43);
  const pathname = `/api/install-tickets/${ticket}`;
  const url = `https://hub.example.test${pathname}`;
  const args = ['add', '--ticket', url, '--to', 'skills'];
  const cases: [string[], RegExp][] = [
    [[...args, 'sample-skill'], /不能与 NAME 或 --version 同时使用/],
    [[...args, '--version', '1.0.0'], /不能与 NAME 或 --version 同时使用/],
    [[...args, '--url', 'https://other.example.test'], /与票据的 Hub 地址不一致/],
    [['add', '--ticket', url], /必须提供明确 --to/],
    ...[
      pathname,
      `ftp://hub.example.test${pathname}`,
      `https://private-token@hub.example.test${pathname}`,
      `https://hub.example.test/elsewhere/..${pathname}`,
      `${url}?`,
      `${url}#`,
      `${url}/archive`,
    ].map<[string[], RegExp]>((address) => [
      ['add', '--ticket', address, '--to', 'skills'],
      /必须是有效的 HTTP\(S\) 安装票据地址/,
    ]),
  ];
  for (const [arguments_, message] of cases) {
    const result = await cli([...arguments_]);
    assert.equal(result.code, 1);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, message);
    assert(!result.stderr.includes(ticket));
    assert(!result.stderr.includes('private-token'));
  }
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
  assert(conversation.stdout.includes('https://hub.example.test/connect/cli'));
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
