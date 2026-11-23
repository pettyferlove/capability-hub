import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { Writable } from 'node:stream';
import { test, type TestContext } from 'node:test';
import { aiConfigurationSchema } from '@capability-hub/ai';
import { aiTables } from '@capability-hub/ai/records';
import {
  aiExecutionDiagnosticsResponseSchema,
  aiExecutionLedgerResponseSchema,
  operationsAgentApi,
  tokenUsageResponseSchema,
} from '@capability-hub/contracts';
import type {
  DiscoveryEntryResponse,
  DiscoveryTurnResponse,
  OperationsResponse,
} from '@capability-hub/contracts/http';
import type { TableName } from '@capability-hub/domain/models';
import { createLogger } from '@capability-hub/logging/server';
import type { Agent } from 'supertest';
import { createTestHub, publishSkill, testPassword, type TestHub } from '../support/application.js';
import { httpClient, signIn } from '../support/http.js';
import {
  openAiJson,
  openAiStream,
  serveModelStub,
  type StubReply,
  type StubRequest,
} from '../support/model-provider-stub.js';
import { serveTestHub } from '../support/server.js';
import { deferred } from '../support/store.js';

type Decision = Record<string, unknown>;
type Dialogue = Extract<DiscoveryTurnResponse, { mode: 'dialogue' }>;

/** 送模输入里用例要读的部分。 */
interface ModelInput {
  shown: { kind: string; count: number; refs: (string | null)[] };
  catalog: { ref: string; slug: string }[];
  catalog_complete: boolean;
}

/** 流式提问请求模型时同样流式；后台资源审计也是流式，但不是首页请求。 */
function streaming(body: unknown) {
  return !!body && typeof body === 'object' && 'stream' in body && body.stream === true;
}

/** 首页对话的出站请求以发现助手的系统指令开头；其他后台请求直接失败，不计入出站。 */
function discoveryRequest(body: unknown) {
  const messages =
    body && typeof body === 'object' && 'messages' in body && Array.isArray(body.messages)
      ? (body.messages as { role: string; content: unknown }[])
      : [];
  const system = messages.find((message) => message.role === 'system')?.content;
  return typeof system === 'string' && system.includes('首页的资源发现助手');
}

/** 以 `Accept: text/event-stream` 提问，读完整条事件流后逐帧解析。 */
async function streamed(client: Agent, body: object) {
  const response = await client
    .post('/api/catalog/discovery/turn')
    .set('Accept', 'text/event-stream')
    .send(body)
    .expect(200);
  assert.match(String(response.headers['content-type']), /^text\/event-stream/);
  return response.text
    .split('\n\n')
    .filter(Boolean)
    .map((frame) => ({
      event: /^event: (.+)$/m.exec(frame)?.[1] ?? '',
      data: JSON.parse(/^data: (.+)$/m.exec(frame)?.[1] ?? 'null') as Record<string, unknown>,
    }));
}

/** Chat Completions 请求体里最后一条用户消息就是送模输入。 */
function modelInput(body: unknown): ModelInput {
  const { messages } = body as { messages: { role: string; content: unknown }[] };
  const content = messages.findLast((message) => message.role === 'user')?.content;
  const text =
    typeof content === 'string'
      ? content
      : (content as { text: string }[]).map((part) => part.text).join('');
  return JSON.parse(text) as ModelInput;
}

/** 模型对本轮卡片里指定资源的判断；卡片里没有的 slug 跳过，如同模型看不到它。 */
function picks(input: ModelInput, slugs: string[], quotes: Record<string, string> = {}) {
  return slugs.flatMap((slug) => {
    const card = input.catalog.find((item) => item.slug === slug);
    return card
      ? [{ ref: card.ref, fit: 'direct', reason: `${slug} 适合这件事`, quote: quotes[slug] ?? '' }]
      : [];
  });
}

/**
 * 带可计数模型替身的测试 Hub；后台资源审计的流式请求直接失败，不计入首页出站。
 * 决策可以是函数，按本轮送出的卡片决定挑哪些引用号。
 */
async function discoveryHub(
  context: TestContext,
  options: {
    logs?: string[];
    maxOutputTokens?: number;
    timeoutMs?: number;
    reply?: (decision: Decision, request: StubRequest) => StubReply | Promise<StubReply>;
  } = {},
) {
  const decisions: (Decision | ((input: ModelInput) => Decision))[] = [];
  const stub = await serveModelStub(context, async (request) => {
    if (!discoveryRequest(request.body)) return { status: 500, json: {} };
    const next = decisions.shift() ?? { action: 'search', patch: {} };
    const decision = typeof next === 'function' ? next(modelInput(request.body)) : next;
    if (options.reply) return await options.reply(decision, request);
    return streaming(request.body) ? openAiStream(decision) : { json: openAiJson(decision) };
  });
  const profile = stub.profile('openai', {
    request_headers: { 'x-trace-session': { from: 'execution_id', prefix: 'hub-' } },
    max_output_tokens: options.maxOutputTokens,
    request_timeout_ms: options.timeoutMs ?? 60000,
  });
  const logs = options.logs;
  const fixture = await createTestHub(
    context,
    {
      ai: aiConfigurationSchema.parse({ profiles: [profile], default_profile: profile.id }),
      ...(logs ? { requestLogging: true, logLevel: 'debug' as const } : {}),
    },
    logs
      ? createLogger({
          service: 'discovery-test',
          level: 'debug',
          destination: new Writable({
            write(chunk: Buffer, _encoding, done) {
              logs.push(chunk.toString());
              done();
            },
          }),
        })
      : undefined,
  );
  return {
    fixture,
    stub,
    decisions,
    calls: () => stub.requests.filter((request) => discoveryRequest(request.body)),
  };
}

async function publish(
  fixture: TestHub,
  slug: string,
  description: string,
  audience: string[] = ['public'],
) {
  const { intake } = await publishSkill(fixture, {
    slug,
    files: [
      {
        path: 'SKILL.md',
        bytes: Buffer.from(`---\nname: ${slug}\ndescription: ${description}\n---\n\n# ${slug}\n`),
        executable: false,
      },
    ],
    distribution: { mode: 'approved_audience', audience },
    appliesTo: { keywords: [] },
  });
  return intake;
}

async function entry(client: Agent) {
  const response = await client.get('/api/catalog/discovery').expect(200);
  const value: DiscoveryEntryResponse = response.body;
  return value;
}

async function turn<K extends Dialogue['type']>(client: Agent, body: object, type: K) {
  const response = await client.post('/api/catalog/discovery/turn').send(body).expect(200);
  const value: DiscoveryTurnResponse = response.body;
  assert(value.mode === 'dialogue' && value.type === type, `expected ${type}`);
  // 上一行已核对判别字段。
  return value as Extract<Dialogue, { type: K }>;
}

async function rejected(client: Agent, body: object, status: number) {
  const response = await client.post('/api/catalog/discovery/turn').send(body).expect(status);
  const error: { code: string; message: string } = response.body.error;
  return error;
}

const releaseNotes = '整理每次发版的发布记录与变更说明，生成发版说明。';
const regression = '对关键 HTTP 接口做回归测试，在发版前发现改动引入的问题。';
const quotes = {
  'release-notes': '整理每次发版的发布记录',
  'http-regression-kit': '对关键 HTTP 接口做回归测试',
};
const firstGuide = (input: ModelInput): Decision => ({
  action: 'guide',
  goal: '每次发版都不放心',
  dimension: '担心的环节',
  question: '你更担心变更没记清楚，还是改动影响了关键接口？',
  directions: [
    {
      label: '核对这次发版改了什么',
      intent: '确认本次发版的变更',
      patch: { requirements: ['发布记录'] },
      picks: picks(input, ['release-notes'], quotes),
    },
    {
      label: '确认关键接口没被改坏',
      intent: '发版前回归关键接口',
      patch: { requirements: ['接口回归测试'] },
      picks: picks(input, ['http-regression-kit'], quotes),
    },
    { label: '准备回滚预案', intent: '出问题时快速回滚', patch: { requirements: ['回滚预案'] } },
  ],
});
const unsureGuide = {
  action: 'guide',
  goal: '每次发版都不放心',
  unsure: true,
  dimension: '担心的环节',
};
const regressionSearch = (input: ModelInput): Decision => ({
  action: 'search',
  goal: '发版前发现接口改动引入的问题',
  patch: { keywords: ['接口', '回归'], requirements: ['接口回归测试'] },
  picks: picks(input, ['http-regression-kit'], quotes),
});

test('模糊的发版担忧经两轮澄清找到有接口回归证据的固定版本，每轮只出站一次', async (context) => {
  const { fixture, decisions, calls } = await discoveryHub(context);
  await publish(fixture, 'release-notes', releaseNotes);
  const kit = await publish(fixture, 'http-regression-kit', regression);
  await publish(fixture, 'gateway-tools', '为网关配置证书、路由与限流。');
  await fixture.worker.waitForIdle();
  const client = httpClient(fixture);
  const start = await entry(client);
  assert.equal(start.mode, 'dialogue');
  const before = calls().length;
  const base = { action: 'message', expected_mode: 'dialogue', viewer_key: start.viewer_key };

  decisions.push(firstGuide);
  const first = await turn(client, { ...base, text: '每次发版我都不太放心' }, 'guide');
  assert.deepEqual(
    first.directions.map((direction) => direction.example.slug),
    ['release-notes', 'http-regression-kit'],
  );
  assert(!JSON.stringify(first).includes('回滚'));

  decisions.push(unsureGuide);
  const second = await turn(
    client,
    { ...base, text: '我也说不清', context: first.context },
    'guide',
  );
  assert.notEqual(second.reply, first.reply);
  assert.deepEqual(
    new Set(second.directions.map((direction) => direction.example.slug)),
    new Set(['release-notes', 'http-regression-kit']),
  );
  assert(second.directions.every((direction) => !direction.label.includes('核对这次发版')));

  decisions.push(regressionSearch);
  const third = await turn(
    client,
    { ...base, text: '怕改完接口没发现问题', context: second.context },
    'matches',
  );
  assert.equal(third.total, 1);
  assert.equal(third.items[0].version_id, kit.version_id);
  assert.deepEqual(third.items[0].judgment, {
    fit: 'direct',
    reason: 'http-regression-kit 适合这件事',
    quote: '对关键 HTTP 接口做回归测试',
  });
  const sent = modelInput(calls().at(-1)?.body);
  assert.deepEqual(sent.catalog.map((card) => card.slug).sort(), [
    'gateway-tools',
    'http-regression-kit',
    'release-notes',
  ]);
  assert.equal(sent.catalog_complete, true);
  assert.equal(calls().length - before, 3);
});

test('只有发布记录工具的目录说明缺少接口回归依据，不拿相近资源凑数', async (context) => {
  const { fixture, decisions } = await discoveryHub(context);
  const notes = await publish(fixture, 'release-notes', releaseNotes);
  await publish(fixture, 'gateway-tools', '为网关配置证书、路由与限流。');
  await fixture.worker.waitForIdle();
  const client = httpClient(fixture);
  const { viewer_key } = await entry(client);
  const base = { action: 'message', expected_mode: 'dialogue', viewer_key };

  decisions.push(firstGuide);
  const first = await turn(client, { ...base, text: '每次发版我都不太放心' }, 'guide');
  assert.deepEqual(first.directions, []);
  assert.deepEqual(
    first.items.map((item) => item.version_id),
    [notes.version_id],
  );

  decisions.push(unsureGuide);
  const second = await turn(
    client,
    { ...base, text: '我也说不清', context: first.context },
    'guide',
  );
  assert.deepEqual(second.directions, []);
  assert.deepEqual(
    second.items.map((item) => item.slug),
    ['release-notes'],
  );

  decisions.push(regressionSearch);
  const third = await turn(
    client,
    { ...base, text: '怕改完接口没发现问题', context: second.context },
    'matches',
  );
  assert.equal(third.total, 0);
  assert.deepEqual(third.items, []);
  assert.deepEqual(third.partial, []);
  assert.deepEqual(third.missing, ['接口回归测试']);
  assert.match(third.reply, /接口回归测试/);
});

test('按条件筛选时必需项只认整句或标签证据，召回词也不命中否定描述', async (context) => {
  const { fixture, decisions } = await discoveryHub(context);
  await publish(fixture, 'junit-basics', '为 Spring Boot 项目生成 JUnit 测试骨架。');
  await publish(fixture, 'auth-negated', 'JUnit 5 测试模板，不支持鉴权测试。');
  const authTests = await publish(
    fixture,
    'auth-tests',
    '用 JUnit 5 编写接口鉴权测试并给出覆盖报告。',
  );
  await fixture.worker.waitForIdle();
  const client = httpClient(fixture);
  const { viewer_key } = await entry(client);
  const base = { expected_mode: 'dialogue', viewer_key };
  decisions.push({
    action: 'search',
    goal: '补鉴权测试',
    patch: { keywords: ['JUnit', '测试'], requirements: ['JUnit 5', '鉴权测试'] },
  });
  const asked = await turn(
    client,
    { ...base, action: 'message', text: '想用 JUnit 5 补上鉴权测试' },
    'matches',
  );
  const filter = (criteria: object) =>
    turn(
      client,
      {
        ...base,
        action: 'filter',
        context: asked.context,
        criteria: { ...asked.criteria, ...criteria },
      },
      'matches',
    );
  const proven = await filter({});
  assert.equal(proven.total, 1);
  assert.deepEqual(
    proven.items.map((item) => item.version_id),
    [authTests.version_id],
  );
  assert.deepEqual(
    proven.partial.map((item) => [item.slug, item.unverified]),
    [['auth-negated', ['鉴权测试']]],
  );
  decisions.push({ action: 'refer', index: 2 });
  const second = await turn(
    client,
    { ...base, action: 'message', text: '第二项呢？', context: proven.context },
    'reference',
  );
  assert.equal(second.item?.version_id, proven.partial[0].version_id);
  const recalled = await filter({ keywords: ['鉴权测试'], requirements: [] });
  assert.deepEqual(
    recalled.items.map((item) => item.slug),
    ['auth-tests'],
  );
});

test('匿名、团队甲与团队乙送模的卡片与看到的方向、依据和计数只来自各自可读的发布', async (context) => {
  const { fixture, decisions, calls } = await discoveryHub(context);
  const other = await fixture.hub.administration.createGroup(fixture.admin, { name: '平台团队' });
  await fixture.hub.administration.createUser(fixture.admin, {
    username: 'member-b',
    display_name: '乙方成员',
    password: testPassword,
    group_ids: [other.id],
  });
  await publish(fixture, 'public-auth', '检查接口鉴权配置。');
  await publish(fixture, 'team-a-auth', '按团队规范检查接口鉴权。', [`group:${fixture.teamId}`]);
  await publish(fixture, 'team-b-auth', '按平台规范检查接口鉴权。', [`group:${other.id}`]);
  await fixture.worker.waitForIdle();
  const viewers: [string, Agent][] = [
    ['anonymous', httpClient(fixture)],
    ['owner', await signIn(fixture, 'owner')],
    ['member-b', await signIn(fixture, 'member-b')],
  ];
  const seen: Record<string, string[]> = {};
  const sent: Record<string, string[]> = {};
  for (const [name, client] of viewers) {
    const { viewer_key } = await entry(client);
    const base = { action: 'message', expected_mode: 'dialogue', viewer_key };
    // 模型挑出送来的全部卡片，再加一个本轮没有送出的引用号。
    decisions.push((input) => ({
      action: 'search',
      goal: '检查鉴权',
      patch: { requirements: ['接口鉴权'] },
      picks: [
        ...picks(
          input,
          input.catalog.map((card) => card.slug),
        ),
        { ref: 'r99', fit: 'direct', reason: '编造的引用', quote: '' },
      ],
    }));
    const matches = await turn(client, { ...base, text: '检查接口鉴权' }, 'matches');
    sent[name] = modelInput(calls().at(-1)?.body)
      .catalog.map((card) => card.slug)
      .sort();
    decisions.push({ ...unsureGuide, goal: '检查接口鉴权' });
    const guide = await turn(client, { ...base, text: '我也说不清' }, 'guide');
    seen[name] = [
      String(matches.total),
      ...matches.items.map((item) => item.slug).sort(),
      ...[
        ...guide.directions.map((direction) => direction.example.slug),
        ...guide.items.map((item) => item.slug),
      ].sort(),
    ];
  }
  assert.deepEqual(seen.anonymous, ['1', 'public-auth', 'public-auth']);
  assert.deepEqual(seen.owner, ['2', 'public-auth', 'team-a-auth', 'public-auth', 'team-a-auth']);
  assert.deepEqual(seen['member-b'], [
    '2',
    'public-auth',
    'team-b-auth',
    'public-auth',
    'team-b-auth',
  ]);
  assert.deepEqual(sent, {
    anonymous: ['public-auth'],
    owner: ['public-auth', 'team-a-auth'],
    'member-b': ['public-auth', 'team-b-auth'],
  });
});

test('结果的指代按上一轮原序解析：上新不换版，越界请用户指明，只采用评对那一项的模型判断', async (context) => {
  const { fixture, decisions, calls } = await discoveryHub(context);
  const first = await publish(fixture, 'auth-tests', '编写接口鉴权测试。');
  const second = await publish(fixture, 'auth-review', '审查接口鉴权测试的覆盖情况。');
  await fixture.worker.waitForIdle();
  const client = httpClient(fixture);
  const { viewer_key } = await entry(client);
  const base = { action: 'message', expected_mode: 'dialogue', viewer_key };
  decisions.push((input) => ({
    action: 'search',
    goal: '鉴权测试',
    patch: { requirements: ['鉴权测试'] },
    picks: picks(input, ['auth-tests', 'auth-review']),
  }));
  const list = await turn(client, { ...base, text: '鉴权测试' }, 'matches');
  const order = list.items.map((item) => item.version_id);
  assert.deepEqual(order, [first.version_id, second.version_id]);

  // 第二项发布新版本会改变当前目录，但「第二个」仍指上一轮展示的那个固定版本。
  await publishSkill(fixture, {
    assetId: list.items[1].asset_id,
    version: '2.0.0',
    files: [
      {
        path: 'SKILL.md',
        bytes: Buffer.from(
          `---\nname: ${list.items[1].slug}\ndescription: 编写接口鉴权测试的新版本。\n---\n\n# 新版本\n`,
        ),
        executable: false,
      },
    ],
  });
  decisions.push({ action: 'refer', index: 2, check: '覆盖报告' });
  const refer = await turn(
    client,
    { ...base, text: '第二个适合我吗', context: list.context },
    'reference',
  );
  assert.equal(refer.item?.version_id, order[1]);
  assert.match(refer.reply, /「覆盖报告」：发布信息未说明/);
  assert.equal(refer.item?.judgment, undefined);
  decisions.push({ action: 'refer', index: 1 });
  const follow = await turn(
    client,
    { ...base, text: '第一项呢', context: refer.context },
    'reference',
  );
  assert.equal(follow.item?.version_id, order[1]);

  decisions.push((input) => ({
    action: 'refer',
    index: 1,
    reply: '适合：它就是用来写接口鉴权测试的。',
    picks: picks(input, ['auth-tests'], { 'auth-tests': '编写接口鉴权测试' }),
  }));
  const judged = await turn(
    client,
    { ...base, text: '第一个适合我吗', context: list.context },
    'reference',
  );
  assert.equal(judged.item?.judgment?.quote, '编写接口鉴权测试');
  assert.match(judged.reply, /^第 1 项是 auth-tests（.+）。适合：/);
  decisions.push({ action: 'refer', index: 5 });
  const outside = await turn(
    client,
    { ...base, text: '第五个呢', context: list.context },
    'reference',
  );
  assert.equal(outside.item, null);
  assert.match(outside.reply, /第几个/);

  await fixture.hub.lifecycle.revokeVersion(fixture.admin, second.version_id, '停止旧版分发');
  const before = calls().length;
  const expired = await rejected(client, { ...base, text: '继续', context: judged.context }, 409);
  assert.equal(expired.code, 'DISCOVERY_BASIS_UNAVAILABLE');
  assert.equal(calls().length, before);
});

test('撤回支撑方向的版本后，「后者」不再回显旧方向，出站请求也不含其文案', async (context) => {
  const { fixture, decisions, calls } = await discoveryHub(context);
  await publish(fixture, 'release-notes', releaseNotes);
  const kit = await publish(fixture, 'http-regression-kit', regression);
  await fixture.worker.waitForIdle();
  const client = httpClient(fixture);
  const { viewer_key } = await entry(client);
  const base = { action: 'message', expected_mode: 'dialogue', viewer_key };
  decisions.push(unsureGuide);
  const guide = await turn(client, { ...base, text: '每次发版我都不太放心' }, 'guide');
  const latter = guide.directions[1];
  assert.equal(latter.example.slug, 'http-regression-kit');

  await fixture.hub.lifecycle.revokeVersion(fixture.admin, kit.version_id, '停止分发');
  const before = calls().length;
  const error = await rejected(client, { ...base, text: '后者', context: guide.context }, 409);
  assert.equal(error.code, 'DISCOVERY_BASIS_UNAVAILABLE');
  assert.equal(error.message, '原依据已不可用，请重新说明');
  assert.equal(calls().length, before);

  decisions.push((input) => ({
    action: 'search',
    goal: '发布记录',
    patch: { requirements: ['发布记录'] },
    picks: picks(input, ['release-notes']),
  }));
  const fresh = await turn(client, { ...base, text: '想整理发布记录' }, 'matches');
  assert.equal(fresh.total, 1);
});

test('模型只能挑本轮送出的可见卡片：越界引用号被丢弃，摘抄逐字核对，写明不适用的资源不靠字面命中出现', async (context) => {
  const { fixture, decisions, calls } = await discoveryHub(context);
  const frontend = await publish(
    fixture,
    'frontend-testing',
    '为前端项目设计、编写和运行单元测试与组件测试。',
  );
  await publish(
    fixture,
    'java-spring-testing',
    '为 Java / Spring Boot 后端编写测试。不用于前端、浏览器或 UI 端到端测试。',
  );
  await publish(fixture, 'design-handbook', '团队内部的界面设计规范。', [
    `group:${fixture.teamId}`,
  ]);
  await fixture.worker.waitForIdle();
  const client = httpClient(fixture);
  const { viewer_key } = await entry(client);
  const base = { expected_mode: 'dialogue', viewer_key };
  const question = { ...base, action: 'message', text: '我现在在做前端设计，有哪些技能可以使用？' };
  decisions.push((input) => ({
    action: 'search',
    goal: '做前端设计',
    reply: '目录里没有界面设计类 Skill；frontend-testing 只覆盖前端测试。',
    patch: { keywords: ['前端'], kind: 'skill' },
    picks: picks(input, ['frontend-testing'], {
      'frontend-testing': '为前端项目设计、编写和运行单元测试',
    }).map((pick) => ({ ...pick, fit: 'partial' })),
  }));
  const judged = await turn(client, question, 'matches');
  const sent = modelInput(calls().at(-1)?.body);
  assert.deepEqual(sent.catalog.map((card) => card.slug).sort(), [
    'frontend-testing',
    'java-spring-testing',
  ]);
  assert.deepEqual(
    judged.items.map((item) => [item.version_id, item.judgment]),
    [
      [
        frontend.version_id,
        {
          fit: 'partial',
          reason: 'frontend-testing 适合这件事',
          quote: '为前端项目设计、编写和运行单元测试',
        },
      ],
    ],
  );
  assert.match(judged.reply, /没有界面设计类/);

  // 本轮没送出的引用号被丢弃，回应随之改用固定说明；改写过的摘抄只保留理由。
  decisions.push((input) => ({
    action: 'search',
    goal: '做前端设计',
    reply: '推荐 design-handbook。',
    picks: [
      ...picks(input, ['frontend-testing'], { 'frontend-testing': '支持 Figma 设计稿' }),
      { ref: 'r9', fit: 'direct', reason: '编造的引用', quote: '' },
    ],
  }));
  const frames = await streamed(client, { ...question, context: judged.context });
  assert(!JSON.stringify(frames).includes('design-handbook'));
  assert.equal(frames.at(-1)?.event, 'result');
  const guarded = frames.at(-1)?.data as unknown as Extract<Dialogue, { type: 'matches' }>;
  assert.deepEqual(
    guarded.items.map((item) => [item.slug, item.judgment?.quote]),
    [['frontend-testing', null]],
  );
  assert.doesNotMatch(guarded.reply, /design-handbook/);

  // 改条件只查目录：召回词「前端」不命中写明「不用于前端」的资源。
  const filtered = await turn(
    client,
    {
      ...base,
      action: 'filter',
      context: guarded.context,
      criteria: { ...guarded.criteria, keywords: ['前端'] },
    },
    'matches',
  );
  assert.deepEqual(
    filtered.items.map((item) => item.slug),
    ['frontend-testing'],
  );
});

test('选方向直接列出模型为该方向挑出的版本，不再出站；方向依据撤回后不再展开', async (context) => {
  const { fixture, decisions, calls } = await discoveryHub(context);
  const notes = await publish(fixture, 'release-notes', releaseNotes);
  const kit = await publish(fixture, 'http-regression-kit', regression);
  await fixture.worker.waitForIdle();
  const client = httpClient(fixture);
  const { viewer_key } = await entry(client);
  const base = { expected_mode: 'dialogue', viewer_key };
  decisions.push(firstGuide);
  const guide = await turn(
    client,
    { ...base, action: 'message', text: '每次发版我都不太放心' },
    'guide',
  );
  assert.equal(guide.directions.length, 2);
  const before = calls().length;
  await publishSkill(fixture, {
    assetId: kit.asset_id,
    slug: 'http-regression-kit',
    version: '2.0.0',
    body: '更新了回归流程。',
  });
  const chosen = await turn(
    client,
    { ...base, action: 'direction', index: 2, context: guide.context },
    'matches',
  );
  assert.match(chosen.reply, /^按第 2 个方向「确认关键接口没被改坏」查找：/);
  assert.deepEqual(
    chosen.items.map((item) => [item.version_id, item.judgment?.quote]),
    [[kit.version_id, '对关键 HTTP 接口做回归测试']],
  );
  assert.deepEqual(chosen.criteria.requirements, ['接口回归测试']);
  const missing = await rejected(
    client,
    { ...base, action: 'direction', index: 3, context: guide.context },
    409,
  );
  assert.equal(missing.code, 'DISCOVERY_DIRECTION_UNAVAILABLE');
  await fixture.hub.lifecycle.revokeVersion(fixture.admin, notes.version_id, '停止分发');
  const revoked = await rejected(
    client,
    { ...base, action: 'direction', index: 1, context: guide.context },
    409,
  );
  assert.equal(revoked.code, 'DISCOVERY_BASIS_UNAVAILABLE');
  assert.equal(calls().length, before);
  const otherDirection = await rejected(
    client,
    { ...base, action: 'direction', index: 2, context: guide.context },
    409,
  );
  assert.equal(otherDirection.code, 'DISCOVERY_BASIS_UNAVAILABLE');
});

test('可见发布放不下时先送字面最相关的卡片，请求体不超过短调用上限', async (context) => {
  const { fixture, decisions, calls } = await discoveryHub(context);
  const filler = '整理团队内部的工作流程与协作规范，'.repeat(12);
  const versions = new Map<string, string>();
  for (let index = 0; index < 32; index++) {
    const slug = `workflow-${index}`;
    versions.set(slug, (await publish(fixture, slug, `${filler}第 ${index} 份。`)).version_id);
  }
  const top = await publish(fixture, 'contract-check', '按 OpenAPI 契约核对接口实现。');
  await fixture.worker.waitForIdle();
  const client = httpClient(fixture);
  const { viewer_key } = await entry(client);
  const base = { action: 'message', expected_mode: 'dialogue', viewer_key };
  decisions.push((input) => ({
    action: 'search',
    goal: '核对契约',
    picks: picks(input, ['contract-check']),
  }));
  const result = await turn(client, { ...base, text: '想核对 OpenAPI 契约' }, 'matches');
  const request = calls().at(-1);
  const sent = modelInput(request?.body);
  assert.equal(sent.catalog_complete, false);
  assert(sent.catalog.length < 33);
  assert.equal(sent.catalog[0].slug, 'contract-check');
  assert(Buffer.byteLength(JSON.stringify(request?.body)) <= 32768);
  assert.equal(result.items[0].version_id, top.version_id);
  // 已送但没有展示的最后一项同样是整段文字的来源，不能只保留前 24 项。
  const lastSource = versions.get(sent.catalog.at(-1)!.slug);
  assert(lastSource && sent.catalog.length > 24);
  await fixture.hub.lifecycle.revokeVersion(fixture.admin, lastSource, '停止分发');
  const before = calls().length;
  assert.equal(
    (await rejected(client, { ...base, text: '继续', context: result.context }, 409)).code,
    'DISCOVERY_BASIS_UNAVAILABLE',
  );
  assert.equal(calls().length, before);
});

test('流式提问先报真实进度，核对后才返回正文与固定版本', async (context) => {
  const { fixture, decisions } = await discoveryHub(context);
  const kit = await publish(fixture, 'http-regression-kit', regression);
  await publish(fixture, 'release-notes', releaseNotes);
  await fixture.worker.waitForIdle();
  const client = httpClient(fixture);
  const { viewer_key } = await entry(client);
  const reply = '目录里的 http-regression-kit 能在发版前回归关键接口，先看它。';
  decisions.push((input) => ({ ...regressionSearch(input), reply }));
  const events = await streamed(client, {
    action: 'message',
    expected_mode: 'dialogue',
    viewer_key,
    text: '怕改完接口没发现问题',
  });
  assert.deepEqual(events[0], {
    event: 'stage',
    data: { stage: 'catalog', resources: 2, complete: true },
  });
  const writing = events.slice(1, -2);
  assert(
    writing.length > 0 &&
      writing.every(
        ({ event, data }) =>
          event === 'stage' &&
          data.stage === 'writing' &&
          typeof data.characters === 'number' &&
          data.characters > 0 &&
          data.characters <= reply.length,
      ),
  );
  assert(!JSON.stringify(events.slice(0, -1)).includes('http-regression-kit'));
  assert.deepEqual(
    events.slice(-2).map((event) => event.event),
    ['stage', 'result'],
  );
  assert.deepEqual(events.at(-2)?.data, { stage: 'verify' });
  const result = events.at(-1)?.data as unknown as Extract<Dialogue, { type: 'matches' }>;
  assert.equal(result.reply, reply);
  assert.deepEqual(
    result.items.map((item) => item.version_id),
    [kit.version_id],
  );
  const operator = await signIn(fixture);
  const listing = await operator
    .get(operationsAgentApi.executions)
    .query({ operation_id: 'catalog-discovery', view: 'summary' })
    .expect(200);
  const ledger = aiExecutionLedgerResponseSchema.parse(listing.body);
  assert.equal(ledger.items.length, 1);
  const [run] = ledger.items;
  assert.equal(run.owner_id, 'anonymous');
  assert.equal(run.owner_display_name, '匿名访客');
  const report = aiExecutionDiagnosticsResponseSchema.parse(
    (await operator.get(operationsAgentApi.diagnostics(run.id)).expect(200)).body,
  );
  assert.equal(report.execution.status, 'succeeded');
  assert.deepEqual(
    report.model_calls.map((call) => [
      call.diagnostics.step?.id,
      call.input_tokens,
      call.output_tokens,
    ]),
    [['turn', 11, 7]],
  );
  for (const privateText of [result.context, reply, 'http-regression-kit', '怕改完接口没发现问题'])
    assert(!JSON.stringify(report).includes(privateText));
});

test('流式提问可用超过 1024 token 的推理和正文，但不会绕过模型档案或重试截断的回答', async (context) => {
  const usage = { input: 1600, reasoning: 629, output: 1320 };
  for (const [configured, expected] of [
    [16384, 4096],
    [1024, 1024],
  ]) {
    const { fixture, decisions, calls } = await discoveryHub(context, {
      maxOutputTokens: configured,
      reply: (decision, { body }) => {
        const { max_tokens: limit } = body as { max_tokens: number };
        return limit < usage.output
          ? openAiStream('{"action":"search","picks":[', {
              usage: { ...usage, output: limit },
              finishReason: 'length',
            })
          : openAiStream(decision, { usage });
      },
    });
    const kit = await publish(fixture, 'java-testing', '为 Java 服务补充单元测试。');
    await fixture.worker.waitForIdle();
    const client = httpClient(fixture);
    const { viewer_key } = await entry(client);
    decisions.push((input) => ({
      action: 'search',
      reply: 'java-testing 可以为 Java 服务补单元测试。',
      picks: picks(input, ['java-testing'], { 'java-testing': '为 Java 服务补充单元测试' }),
    }));
    const frames = await streamed(client, {
      viewer_key,
      expected_mode: 'dialogue',
      action: 'message',
      text: 'Java',
    });
    const terminal = frames.at(-1)!;
    if (expected < usage.output) {
      assert.equal(terminal.event, 'error');
      assert.equal(terminal.data.status, 502);
      assert.equal((terminal.data.error as { code: string }).code, 'DISCOVERY_OUTPUT_INVALID');
      assert(!frames.some((frame) => frame.event === 'result'));
    } else {
      assert.equal(terminal.event, 'result');
      const result = terminal.data as unknown as Extract<Dialogue, { type: 'matches' }>;
      assert.deepEqual(
        result.items.map((item) => item.version_id),
        [kit.version_id],
      );
    }
    const outbound = calls();
    assert.equal(outbound.length, 1);
    assert.equal((outbound[0].body as { max_tokens: number }).max_tokens, expected);
  }
});

test('流式提问在模型开始回应前失去团队成员资格时不推送回应文字，以错误帧结束', async (context) => {
  const arrived = deferred();
  const respond = deferred();
  const { fixture, decisions } = await discoveryHub(context, {
    reply: async (decision) => {
      arrived.resolve();
      await respond.promise;
      return openAiStream(decision);
    },
  });
  await publish(fixture, 'team-auth', '按团队规范检查接口鉴权。', [`group:${fixture.teamId}`]);
  await fixture.worker.waitForIdle();
  const client = await signIn(fixture, 'reviewer');
  const { viewer_key } = await entry(client);
  decisions.push((input) => ({
    action: 'search',
    goal: '检查鉴权',
    reply: '推荐 team-auth，它按团队规范检查接口鉴权。',
    picks: picks(input, ['team-auth']),
  }));
  const pending = streamed(client, {
    action: 'message',
    expected_mode: 'dialogue',
    viewer_key,
    text: '检查接口鉴权',
  });
  await arrived.promise;
  const [membership] = await fixture.store.where('memberships', 'user_id', fixture.reviewer.id);
  await fixture.hub.administration.removeGrant(fixture.admin, 'memberships', membership.id);
  respond.resolve();
  const events = await pending;
  assert(!events.some(({ event }) => event === 'result' || event === 'reply'));
  const last = events.at(-1);
  assert.equal(last?.event, 'error');
  assert.equal(last?.data.status, 409);
  const detail = last?.data.error as { code: string; message: string; request_id: string };
  assert.equal(detail.code, 'DISCOVERY_VIEWER_CHANGED');
  assert.equal(detail.message, '登录状态已变化，原问题和结果已清除，请重新提问');
  assert.match(detail.request_id, /^[\da-f-]{36}$/i);
  assert(!JSON.stringify(events).includes('team-auth'));
  const [execution] = await fixture.hub.ai.runtime.store.list('ai_executions', {
    lookup_key: 'catalog-discovery',
    limit: 1,
  });
  assert.equal(execution.status, 'failed');
  assert.equal(execution.payload.usage.output_tokens, 7);
});

test('模型作答时未入选的来源被撤回，也不发送可能引用它的自由文本', async (context) => {
  const arrived = deferred();
  const respond = deferred();
  const { fixture, decisions } = await discoveryHub(context, {
    reply: async (decision) => {
      arrived.resolve();
      await respond.promise;
      return openAiStream(decision);
    },
  });
  const source = await publish(fixture, 'team-migration', '核对切换前的记录。', [
    `group:${fixture.teamId}`,
  ]);
  await fixture.worker.waitForIdle();
  const client = await signIn(fixture, 'reviewer');
  const { viewer_key } = await entry(client);
  decisions.push({ action: 'search', picks: [], reply: 'team-migration 只适合切换前核对。' });
  const pending = streamed(client, {
    action: 'message',
    expected_mode: 'dialogue',
    viewer_key,
    text: '有适合上线后用的吗？',
  });
  await arrived.promise;
  try {
    await fixture.hub.lifecycle.revokeVersion(fixture.admin, source.version_id, '停止分发');
  } finally {
    respond.resolve();
  }
  const frames = await pending;
  assert.equal(frames.at(-1)?.event, 'error');
  assert.equal((frames.at(-1)?.data.error as { code: string }).code, 'DISCOVERY_BASIS_UNAVAILABLE');
  assert(!JSON.stringify(frames).includes('team-migration'));
});

test('模型返回前失去团队成员资格时丢弃输出，不展示受限结果', async (context) => {
  const arrived = deferred();
  const respond = deferred();
  const { fixture, decisions } = await discoveryHub(context, {
    reply: async (decision) => {
      arrived.resolve();
      await respond.promise;
      return { json: openAiJson(decision) };
    },
  });
  await publish(fixture, 'team-auth', '按团队规范检查接口鉴权。', [`group:${fixture.teamId}`]);
  await fixture.worker.waitForIdle();
  const client = await signIn(fixture, 'reviewer');
  const { viewer_key } = await entry(client);
  decisions.push({ action: 'search', goal: '检查鉴权', patch: { requirements: ['接口鉴权'] } });
  const request = client
    .post('/api/catalog/discovery/turn')
    .send({ action: 'message', expected_mode: 'dialogue', viewer_key, text: '检查接口鉴权' })
    .then((response) => response);
  await arrived.promise;
  const [membership] = await fixture.store.where('memberships', 'user_id', fixture.reviewer.id);
  await fixture.hub.administration.removeGrant(fixture.admin, 'memberships', membership.id);
  respond.resolve();
  const response = await request;
  assert.equal(response.status, 409);
  assert.equal(response.body.error.code, 'DISCOVERY_VIEWER_CHANGED');
  assert(!response.text.includes('team-auth'));
});

test('发现入口和提问在读目录时解析会话，不使用等待派发前的授权', async (context) => {
  const { fixture, calls } = await discoveryHub(context);
  const reader = await signIn(fixture, 'reader');
  const reviewer = await signIn(fixture, 'reviewer');
  const key = (await entry(reviewer)).viewer_key;
  const discovery = fixture.hub.discovery;
  const getEntry = discovery.entry.bind(discovery);
  context.mock.method(
    discovery,
    'entry',
    async (...args: Parameters<typeof getEntry>) => {
      await fixture.hub.sessions.revokeAll(fixture.reader.id);
      return await getEntry(...args);
    },
    { times: 1 },
  );
  assert.equal((await entry(reader)).viewer_key, 'anonymous');

  const [membership] = await fixture.store.where('memberships', 'user_id', fixture.reviewer.id);
  const submit = discovery.turn.bind(discovery);
  context.mock.method(
    discovery,
    'turn',
    async (...args: Parameters<typeof submit>) => {
      await fixture.hub.administration.removeGrant(fixture.admin, 'memberships', membership.id);
      return await submit(...args);
    },
    { times: 1 },
  );
  const error = await rejected(
    reviewer,
    {
      action: 'message',
      expected_mode: 'dialogue',
      viewer_key: key,
      text: '帮我找个资源',
    },
    409,
  );
  assert.equal(error.code, 'DISCOVERY_VIEWER_CHANGED');
  assert.equal(calls().length, 0);
});

test('选卡后出站预留前依据撤回，整批不送模也不产生发现执行', async (context) => {
  const { fixture, calls } = await discoveryHub(context);
  const source = await publish(fixture, 'catalog-boundary', '核对发布条件。', [
    `group:${fixture.teamId}`,
  ]);
  await fixture.worker.waitForIdle();
  const client = await signIn(fixture, 'reviewer');
  const { viewer_key } = await entry(client);
  const runtime = fixture.hub.ai.runtime;
  const execute = runtime.runInline.bind(runtime);
  context.mock.method(
    runtime,
    'runInline',
    async (...args: Parameters<typeof execute>) => {
      await fixture.hub.lifecycle.revokeVersion(fixture.admin, source.version_id, '停止分发');
      return await execute(...args);
    },
    { times: 1 },
  );
  const error = await rejected(
    client,
    { action: 'message', expected_mode: 'dialogue', viewer_key, text: '怎么核对？' },
    409,
  );
  assert.equal(error.code, 'DISCOVERY_BASIS_UNAVAILABLE');
  assert.equal(calls().length, 0);
  assert.deepEqual(
    await runtime.store.list('ai_executions', { lookup_key: 'catalog-discovery', limit: 1 }),
    [],
  );
});

test('HTTP 会话读取期间客户端离开，不出站也不创建发现执行', { timeout: 15000 }, async (context) => {
  const stub = await serveModelStub(context, () => ({ json: openAiJson({ action: 'search' }) }));
  const profile = stub.profile('openai');
  const fixture = await serveTestHub(context, {
    ai: aiConfigurationSchema.parse({ profiles: [profile], default_profile: profile.id }),
  });
  const reading = deferred();
  const resume = deferred();
  let serverSignal: AbortSignal | undefined;
  const finished = deferred();
  const get = fixture.store.get.bind(fixture.store);
  context.mock.method(fixture.store, 'get', async (table: TableName, id: string) => {
    if (table === 'sessions') {
      reading.resolve();
      await resume.promise;
    }
    return await get(table, id);
  });
  const submit = fixture.hub.discovery.turn.bind(fixture.hub.discovery);
  context.mock.method(fixture.hub.discovery, 'turn', async (...args: Parameters<typeof submit>) => {
    serverSignal = args[1].signal;
    try {
      return await submit(...args);
    } finally {
      finished.resolve();
    }
  });
  const client = new AbortController();
  const request = fetch(`${fixture.origin}/api/catalog/discovery/turn`, {
    method: 'POST',
    signal: client.signal,
    headers: {
      'Content-Type': 'application/json',
      Origin: fixture.origin,
      Cookie: 'hub_session=fixture',
    },
    body: JSON.stringify({
      action: 'message',
      expected_mode: 'dialogue',
      viewer_key: 'anonymous',
      text: '找资源',
    }),
  });
  try {
    await Promise.race([reading.promise, request.then(() => assert.fail('请求没有等待会话读取'))]);
    assert(serverSignal);
    const disconnected = once(serverSignal, 'abort', { signal: AbortSignal.timeout(5000) });
    client.abort();
    await assert.rejects(request, { name: 'AbortError' });
    await disconnected;
  } finally {
    client.abort();
    resume.resolve();
  }
  await finished.promise;
  assert.equal(stub.requests.length, 0);
  assert.deepEqual(
    await fixture.hub.ai.runtime.store.list('ai_executions', {
      lookup_key: 'catalog-discovery',
      limit: 1,
    }),
    [],
  );
});

test('上限长度的中文条件、方向和判断仍可原样回传并展开固定版本', async (context) => {
  const { fixture, decisions, calls } = await discoveryHub(context);
  const quote = '核'.repeat(120);
  const words = ['甲', '乙', '丙', '丁', '戊'].map((word) => word.repeat(64));
  const slugs = ['first-check', 'second-check', 'third-check'];
  for (const slug of slugs) await publish(fixture, slug, quote);
  await fixture.worker.waitForIdle();
  const client = httpClient(fixture);
  const { viewer_key } = await entry(client);
  const base = { expected_mode: 'dialogue', viewer_key };
  decisions.push((input) => ({
    action: 'guide',
    goal: '事'.repeat(200),
    dimension: '类'.repeat(28),
    patch: { keywords: words, requirements: words },
    directions: slugs.map((_, i) => ({
      label: String.fromCharCode(0x4e00 + i).repeat(28),
      intent: '用'.repeat(200),
      patch: { requirements: words },
      picks: [...slugs.slice(i), ...slugs.slice(0, i)].flatMap((slug) =>
        picks(input, [slug], { [slug]: quote }).map((pick) => ({
          ...pick,
          reason: '合'.repeat(120),
        })),
      ),
    })),
  }));
  const guide = await turn(
    client,
    { ...base, action: 'message', text: '这些用途有何区别？' },
    'guide',
  );
  assert.equal(guide.directions.length, 3);
  assert(guide.context.length <= 16 * 1024);
  const result = await turn(
    client,
    { ...base, action: 'direction', index: 3, context: guide.context },
    'matches',
  );
  assert.deepEqual(
    result.items.map((item) => item.slug),
    [slugs[2], ...slugs.slice(0, 2)],
  );
  assert(
    result.items.every(
      (item) => item.judgment?.reason === '合'.repeat(120) && item.judgment.quote === quote,
    ),
  );
  assert.equal(calls().length, 1);
});

test('访客标记或模式不符时不出站；篡改或换人回放的上下文被拒绝', async (context) => {
  const { fixture, decisions, calls } = await discoveryHub(context);
  await publish(fixture, 'auth-tests', '编写接口鉴权测试。');
  await fixture.worker.waitForIdle();
  const anonymous = httpClient(fixture);
  const owner = await signIn(fixture, 'owner');
  const ownerKey = (await entry(owner)).viewer_key;
  assert.notEqual(ownerKey, 'anonymous');
  assert.equal((await entry(anonymous)).viewer_key, 'anonymous');
  const before = calls().length;
  const message = { action: 'message', text: '鉴权测试' };
  const viewer = await rejected(
    anonymous,
    { ...message, expected_mode: 'dialogue', viewer_key: ownerKey },
    409,
  );
  assert.equal(viewer.code, 'DISCOVERY_VIEWER_CHANGED');
  const mode = await rejected(
    owner,
    { ...message, expected_mode: 'keywords', viewer_key: ownerKey },
    409,
  );
  assert.equal(mode.code, 'DISCOVERY_MODE_CHANGED');
  assert.equal(calls().length, before);

  decisions.push({ action: 'search', goal: '鉴权测试', patch: { requirements: ['鉴权测试'] } });
  const list = await turn(
    owner,
    { ...message, expected_mode: 'dialogue', viewer_key: ownerKey },
    'matches',
  );
  const [version, body, mac] = list.context.split('.');
  const changedBody = (body[0] === 'A' ? 'B' : 'A') + body.slice(1);
  for (const token of [`${version}.${changedBody}.${mac}`, `${list.context}.extra`]) {
    const error = await rejected(
      owner,
      {
        ...message,
        expected_mode: 'dialogue',
        viewer_key: ownerKey,
        context: token,
      },
      400,
    );
    assert.equal(error.code, 'DISCOVERY_CONTEXT_INVALID');
  }
  const keywords = httpClient(await createTestHub(context));
  const invalid = await rejected(
    keywords,
    {
      ...message,
      expected_mode: 'keywords',
      viewer_key: 'anonymous',
      context: list.context,
    },
    422,
  );
  assert.equal(invalid.code, 'VALIDATION_ERROR');
  const replayed = await rejected(
    anonymous,
    { ...message, expected_mode: 'dialogue', viewer_key: 'anonymous', context: list.context },
    400,
  );
  assert.equal(replayed.code, 'DISCOVERY_CONTEXT_INVALID');
  assert.equal(calls().length, before + 1);
});

test('格式错误只出站一次；超出每主体额度时不再出站，独立目录仍可用', async (context) => {
  const { fixture, decisions, calls } = await discoveryHub(context);
  await publish(fixture, 'auth-tests', '编写接口鉴权测试。');
  await fixture.worker.waitForIdle();
  const client = httpClient(fixture);
  const { viewer_key } = await entry(client);
  const body = { action: 'message', expected_mode: 'dialogue', viewer_key, text: '鉴权测试' };
  const before = calls().length;
  const invalid = [
    { action: 'unknown' },
    { action: 'search', patch: { requirement: ['鉴权测试'] } },
    { action: 'guide', directions: [{ label: '方向', intent: '核查', patch: {}, pick: [] }] },
    { action: 'search', patch: { requirements: ['ﬃ'.repeat(22)] } },
  ];
  for (const [index, decision] of invalid.entries()) {
    decisions.push(decision);
    assert.equal((await rejected(client, body, 502)).code, 'DISCOVERY_OUTPUT_INVALID');
    assert.equal(calls().length, before + index + 1);
  }
  for (let index = invalid.length; index < 8; index++) {
    decisions.push({ action: 'search', patch: { requirements: [' ＡＰＩ　　鉴权 '] } });
    assert.deepEqual((await turn(client, body, 'matches')).criteria.requirements, ['API 鉴权']);
  }
  assert.equal((await rejected(client, body, 429)).code, 'DISCOVERY_BUSY');
  assert.equal(calls().length, before + 8);
  const runs = await fixture.hub.ai.runtime.store.list('ai_executions', {
    lookup_key: 'catalog-discovery',
    limit: 20,
  });
  assert.equal(runs.length, 8);
  await client.get('/api/assets?q=auth').expect(200);
});

test('出站请求只带服务端模型凭据与每次新生成的关联头，不转发访客凭据或标记', async (context) => {
  const { fixture, decisions, calls, stub } = await discoveryHub(context);
  await publish(fixture, 'auth-tests', '编写接口鉴权测试。');
  await fixture.worker.waitForIdle();
  const owner = await signIn(fixture, 'owner');
  const anonymous = httpClient(fixture);
  const before = calls().length;
  for (const client of [owner, anonymous]) {
    const { viewer_key } = await entry(client);
    decisions.push({ action: 'search', patch: { requirements: ['鉴权测试'] } });
    await turn(
      client.set('Idempotency-Key', randomUUID()).set('X-Extra', 'visitor'),
      { action: 'message', expected_mode: 'dialogue', viewer_key, text: '鉴权测试' },
      'matches',
    );
  }
  const sent = calls().slice(before);
  assert.equal(sent.length, 2);
  const correlation = sent.map((request) => String(request.headers['x-trace-session']));
  assert(correlation.every((value) => /^hub-[0-9a-f-]{36}$/.test(value)));
  assert.notEqual(correlation[0], correlation[1]);
  for (const request of sent) {
    assert.equal(request.headers.authorization, `Bearer ${stub.credential}`);
    for (const header of ['cookie', 'x-csrf-token', 'idempotency-key', 'x-extra'])
      assert.equal(request.headers[header], undefined);
    assert(!JSON.stringify(request.body).includes((await entry(owner)).viewer_key));
  }
});

test('成功、超时与格式错误都不在幂等、AI 记录、审计或日志中留下问题正文', async (context) => {
  const logs: string[] = [];
  const marker = `MARKER-${randomUUID()}`;
  let mode: 'ok' | 'hang' | 'invalid' | 'fields' = 'ok';
  const { fixture, decisions } = await discoveryHub(context, {
    timeoutMs: 1000,
    logs,
    reply: (decision, request) => {
      if (mode === 'hang') return { hang: true };
      const output =
        mode === 'invalid'
          ? `说明：{"action":"search","reply":"${marker}"}`
          : mode === 'fields'
            ? '```json\n' + JSON.stringify({ action: marker }) + '\n```'
            : decision;
      return streaming(request.body) ? openAiStream(output) : { json: openAiJson(output) };
    },
  });
  await publish(fixture, 'auth-tests', '编写接口鉴权测试。');
  await fixture.worker.waitForIdle();
  const client = await signIn(fixture, 'owner');
  const { viewer_key } = await entry(client);
  const body = { action: 'message', expected_mode: 'dialogue', viewer_key, text: marker };
  decisions.push({ action: 'search', goal: marker, patch: { keywords: [marker.slice(0, 60)] } });
  const ok = await turn(client.set('Idempotency-Key', randomUUID()), body, 'matches');
  mode = 'hang';
  assert.equal((await rejected(client, body, 504)).code, 'DISCOVERY_TIMEOUT');
  mode = 'invalid';
  const invalid = await rejected(client, body, 502);
  assert.equal(invalid.code, 'DISCOVERY_OUTPUT_INVALID');
  assert.match(invalid.message, /JSON/);
  mode = 'fields';
  const frames = await streamed(client, body);
  assert.equal(frames.at(-1)?.event, 'error');
  assert.equal(frames.at(-1)?.data.status, 502);
  const detail = frames.at(-1)?.data.error as { code: string; message: string; request_id: string };
  assert.equal(detail.code, 'DISCOVERY_OUTPUT_INVALID');
  assert.match(detail.message, /字段/);
  assert(!JSON.stringify(frames).includes(marker));
  const failures = logs
    .flatMap((line) =>
      line
        .trim()
        .split('\n')
        .map(
          (row) =>
            JSON.parse(row) as {
              event: string;
              request_id: string;
              output?: { issue: string; used: number };
            },
        ),
    )
    .filter((record) => record.event === 'discovery.turn_failed');
  assert(failures.some((record) => record.output?.issue === 'json'));
  const diagnostic = failures.find((record) => record.request_id === detail.request_id)?.output;
  assert.equal(diagnostic?.issue, 'schema');
  assert.equal(diagnostic.used, 7);
  assert(JSON.stringify(ok).includes(marker));
  const stored = JSON.stringify(
    await Promise.all(
      (['idempotency', 'audit', 'jobs', 'catalog_prompts'] as const).map((table) =>
        fixture.store.all(table),
      ),
    ),
  );
  assert(!stored.includes(marker));
  const ai = fixture.hub.ai.runtime.store;
  for (const table of aiTables) {
    const rows = JSON.stringify(await ai.list(table, { limit: 1000 }));
    assert(!rows.includes(marker));
    assert(!rows.includes(viewer_key));
  }
  const snapshot = await client.get('/api/admin/operations').expect(200);
  const { agents } = snapshot.body as OperationsResponse;
  const agent = agents.operations.find((item) => item.id === 'catalog-discovery');
  assert.equal(agent?.title, '首页对话检索');
  assert.deepEqual(agent.activity?.by_status, { succeeded: 1, failed: 2, timed_out: 1 });
  const usage = tokenUsageResponseSchema.parse(
    (await client.get('/api/admin/token-usage').expect(200)).body,
  );
  const tokens = usage.by_agent.find((item) => item.id === 'catalog-discovery');
  assert(tokens);
  assert.equal(tokens.requests, 4);
  assert.equal(tokens.pending_requests, 0);
  assert.equal(tokens.unknown_requests, 1);
  assert.equal(tokens.input_tokens, 33);
  assert.equal(tokens.output_tokens, 21);
  assert(logs.some((line) => line.includes('discovery.turn')));
  assert(!logs.join('').includes(marker));
});
